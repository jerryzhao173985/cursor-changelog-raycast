import re
import os
import csv
from dotenv import load_dotenv
from firecrawl import FirecrawlApp

# Load environment variables from .env file
load_dotenv()

# Get API key from environment variable
api_key = os.getenv("FIRECRAWL_API_KEY")

if not api_key:
    print("Error: FIRECRAWL_API_KEY not found in .env file.")
    exit()

app = FirecrawlApp(api_key=api_key)

output_csv_file = 'changelog_patches.csv'

# Clean up a description string
def clean_description(desc):
    desc = desc.strip()
    
    # Remove leading punctuation that indicates this is a partial description
    desc = re.sub(r'^[.,:;\-)\]]+\s*', '', desc)
    
    # Replace markdown links with just the text
    desc = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', desc)
    
    # Remove URLs  
    desc = re.sub(r'https?://\S+', '', desc)
    
    # Remove markdown heading markers
    desc = re.sub(r'^##\s*', '', desc)
    
    # Remove artifacts from abbreviated ranges
    desc = re.sub(r'^\d+\):\s*', '', desc)
    
    # Clean up other non-descriptive artifacts
    desc = re.sub(r'^[):\]\[]+\s*', '', desc)
    
    # Remove words like "nightly" at the beginning of descriptions
    desc = re.sub(r'^nightly\s*', '', desc, flags=re.IGNORECASE)
    
    # Replace newlines with spaces to make it a single paragraph
    desc = re.sub(r'\s*\n\s*', ' ', desc)
    
    # Remove extra spaces
    desc = re.sub(r'\s+', ' ', desc)
    
    # Check for descriptions that seem incomplete (likely not the proper description)
    if desc.startswith('of ') or desc.startswith('until '):
        return ''
    
    return desc.strip()

# Find individual patch descriptions from formatted lines
def extract_individual_patches(content):
    """
    Extract individual patches from formatted lines like:
    "0.47.1: Description - 0.47.2: Another description - 0.47.3: Third description"
    """
    patches = {}
    
    # Pattern to match version numbers followed by descriptions
    pattern = r'(\d+\.\d+\.\d+)\s*:?\s*-?\s*([^-:0-9][^0-9]*?)(?=\s*-\s*\d+\.\d+\.\d+|\n|$)'
    
    # Find all matches throughout the content
    matches = re.findall(pattern, content, re.DOTALL)
    
    for version, desc in matches:
        # Skip if not starting with 0.
        if not version.startswith('0.'):
            continue
            
        desc = clean_description(desc)
        if desc and len(desc) > 10:  # Ensure meaningful description
            patches[version] = desc
    
    return patches

# Consolidate versions with identical descriptions into version ranges
def consolidate_versions(patches_dict):
    """
    Converts individual versions with identical descriptions into version ranges.
    Returns a list of [version_or_range, description] entries.
    """
    # Invert the dictionary: group versions by description
    grouped_by_desc = {}
    for version, desc in patches_dict.items():
        if desc not in grouped_by_desc:
            grouped_by_desc[desc] = []
        grouped_by_desc[desc].append(version)
    
    consolidated = []
    
    for desc, versions in grouped_by_desc.items():
        # Skip entries without meaningful descriptions
        if not desc or len(desc) < 10:
            continue
        
        # Sort versions to find consecutive ranges
        # Only consider 0.xx.yy versions (not 1.xx which are likely false positives)
        valid_versions = [v for v in versions if v.startswith('0.')]
        
        if not valid_versions:
            continue
            
        valid_versions.sort(key=lambda v: [int(n) if n.isdigit() else 0 for n in v.split('.')])
        
        # Group consecutive versions
        ranges = []
        current_range = [valid_versions[0]]
        
        # Function to extract major.minor.patch as integers
        def version_parts(v):
            parts = v.split('.')
            return [int(p) if p.isdigit() else p for p in parts]
        
        for i in range(1, len(valid_versions)):
            prev_parts = version_parts(valid_versions[i-1])
            curr_parts = version_parts(valid_versions[i])
            
            # Check if versions are consecutive
            if (len(prev_parts) == 3 and len(curr_parts) == 3 and 
                prev_parts[0] == curr_parts[0] and 
                prev_parts[1] == curr_parts[1] and
                prev_parts[2] + 1 == curr_parts[2]):
                current_range.append(valid_versions[i])
            else:
                ranges.append(current_range)
                current_range = [valid_versions[i]]
        
        ranges.append(current_range)
        
        # Convert ranges to version strings
        for range_group in ranges:
            if len(range_group) == 1:
                consolidated.append([range_group[0], desc])
            else:
                range_str = f"{range_group[0]}-{range_group[-1]}"
                consolidated.append([range_str, desc])
    
    # Sort consolidated list by version (newest first)
    def get_version_tuple(version_str):
        # Handle ranges by taking the latest version in the range
        if '-' in version_str:
            version_str = version_str.split('-')[1]
        
        # Convert version to tuple of integers for sorting
        parts = version_str.split('.')
        return tuple(int(p) if p.isdigit() else 0 for p in parts)
    
    consolidated.sort(key=lambda x: get_version_tuple(x[0]), reverse=True)
    
    return consolidated

# Scrape a website and get the markdown:
try:
    print("Scraping changelog...")
    scraped_data = app.scrape_url('https://www.cursor.com/changelog')
    markdown_content = scraped_data.get('markdown', '')

    if not markdown_content:
        print("Error: Could not retrieve markdown content.")
        exit()
    
    print("Processing content...")
    latest_specific_patch = None
    all_patches = {}  # Use a dictionary to avoid duplicates
    
    # First, extract all explicitly described individual patches
    
    # Extract from lines like "0.47.1: Description - 0.47.2: Another description"
    individual_patches = extract_individual_patches(markdown_content)
    all_patches.update(individual_patches)
    
    # Look for specific version patterns at the start of lines
    patch_pattern = r'(?:^|\n)(\d+\.\d+\.\d+)\s*:?\s*-?\s*([^-:0-9][^0-9\n]*?)(?=\n|$)'
    all_specific_patches = re.findall(patch_pattern, markdown_content)
    
    for version, desc in all_specific_patches:
        # Skip if not starting with 0.
        if not version.startswith('0.'):
            continue
            
        desc = clean_description(desc)
        if desc and len(desc) > 10:  # Ensure meaningful description
            # Prefer longer descriptions if we already have one
            if version not in all_patches or len(desc) > len(all_patches[version]):
                all_patches[version] = desc
    
    # Handle listings in the Patches section
    patches_sections = re.finditer(r'(?:###\s*Patches|\*\*Patches\*\*)(.*?)(?=###|\*\*[A-Z]|\Z)', markdown_content, re.DOTALL)
    for match in patches_sections:
        patches_section = match.group(1).strip()
        # Extract individual patches
        section_patches = extract_individual_patches(patches_section)
        
        for version, desc in section_patches.items():
            if version not in all_patches or len(desc) > len(all_patches[version]):
                all_patches[version] = desc
    
    # Handle explicitly described range groups
    
    # First check for formatted lines that include multiple patch versions with descriptions
    version_blocks = re.finditer(r'(?:^|\n)((?:\d+\.\d+\.\d+\s*:?\s*-?\s*[^-:0-9][^0-9\n]*?(?:\s*-\s*)?)+)(?=\n|$)', markdown_content, re.DOTALL)
    for block_match in version_blocks:
        block = block_match.group(1)
        block_patches = extract_individual_patches(block)
        all_patches.update(block_patches)
    
    # Now handle range patterns like "UPDATE (0.45.1-0.45.11): [description]"
    # Only apply to versions that don't already have a description
    version_range_pattern = r'UPDATE\s*\((\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+)\):\s*(.+?)(?=\n\n|\n[A-Z]|\Z)'
    version_ranges = re.findall(version_range_pattern, markdown_content, re.DOTALL)
    
    for start_version, end_version, description in version_ranges:
        # Skip if not starting with 0.
        if not start_version.startswith('0.'):
            continue
            
        # Parse version components
        try:
            major1, minor1, patch1 = map(int, start_version.split('.'))
            major2, minor2, patch2 = map(int, end_version.split('.'))
            
            # Ensure same major and minor version for simplicity
            if major1 == major2 and minor1 == minor2:
                # Clean up the description
                description_clean = clean_description(description)
                
                # Generate individual versions in the range
                for patch in range(patch1, patch2 + 1):
                    version = f"{major1}.{minor1}.{patch}"
                    # Only add if we don't already have a description for this version
                    if version not in all_patches:
                        all_patches[version] = description_clean
        except ValueError:
            # Skip if version parsing fails
            continue
    
    # Handle abbreviated version ranges like "UPDATE (0.45.12-13): [description]"
    abbreviated_range_pattern = r'UPDATE\s*\((\d+\.\d+\.)(\d+)\s*-\s*(\d+)\):\s*(.+?)(?=\n\n|\n[A-Z]|\Z)'
    abbreviated_ranges = re.findall(abbreviated_range_pattern, markdown_content, re.DOTALL)
    
    for prefix, start_patch, end_patch, description in abbreviated_ranges:
        # Skip if not starting with 0.
        if not prefix.startswith('0.'):
            continue
            
        # Clean up the description
        description_clean = clean_description(description)
        
        # Generate individual versions in the range
        for patch in range(int(start_patch), int(end_patch) + 1):
            version = f"{prefix}{patch}"
            # Only add if we don't already have a description for this version
            if version not in all_patches:
                all_patches[version] = description_clean
    
    # Handle formats like "(0.42.1 - 0.42.5): [description]"
    alt_version_range_pattern = r'\((\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+)\):\s*(.+?)(?=\n\n|\n[A-Z]|\Z)'
    alt_version_ranges = re.findall(alt_version_range_pattern, markdown_content, re.DOTALL)
    
    for start_version, end_version, description in alt_version_ranges:
        # Skip if not starting with 0.
        if not start_version.startswith('0.'):
            continue
            
        # Parse version components
        try:
            major1, minor1, patch1 = map(int, start_version.split('.'))
            major2, minor2, patch2 = map(int, end_version.split('.'))
            
            # Ensure same major and minor version for simplicity
            if major1 == major2 and minor1 == minor2:
                # Clean up the description
                description_clean = clean_description(description)
                
                # Generate individual versions in the range
                for patch in range(patch1, patch2 + 1):
                    version = f"{major1}.{minor1}.{patch}"
                    # Only add if we don't already have a description for this version
                    if version not in all_patches:
                        all_patches[version] = description_clean
        except ValueError:
            # Skip if version parsing fails
            continue
    
    # Also look for major version headers like "0.48.x"
    major_version_pattern = r'(?:^|\n)(\d+\.\d+\.x)[\n\s]+(.*?)(?=\n\n|\n\d+\.\d+\.|\Z)'
    major_version_matches = re.findall(major_version_pattern, markdown_content, re.DOTALL)
    
    for version, full_desc in major_version_matches:
        # Skip if not starting with 0.
        if not version.startswith('0.'):
            continue
            
        desc = clean_description(full_desc)
        if desc and version not in all_patches:
            all_patches[version] = desc
    
    # Remove entries with invalid descriptions
    for version in list(all_patches.keys()):
        desc = all_patches[version]
        # Check for descriptions that are just markdown syntax or brackets or too short
        if desc in ['](', ']', ')', '](http', ':', ''] or len(desc) < 10:
            del all_patches[version]
    
    # Print count of unique patches found
    print(f"Found {len(all_patches)} unique patch versions with descriptions")
    
    # Consolidate versions with identical descriptions into ranges
    consolidated_patches = consolidate_versions(all_patches)
    
    # Get the latest specific version (not x)
    for version_or_range, desc in consolidated_patches:
        version = version_or_range.split('-')[-1]  # Take the last version in case of a range
        if 'x' not in version and version.startswith('0.') and len(desc) > 10:  # Ensure meaningful description
            latest_specific_patch = f"{version_or_range} - {desc}"
            break

    # --- Output --- 
    # 1. Print the latest found patch/version
    if latest_specific_patch:
        print("\nLatest Patch/Version Found:")
        print(latest_specific_patch)
    else:
        print("\nCould not find any version or specific patch note at the beginning of the changelog.")

    # 2. Write all specific patches to CSV
    if consolidated_patches:
        print(f"\nWriting {len(consolidated_patches)} consolidated patches to {output_csv_file}...")
        try:
            with open(output_csv_file, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(['Version', 'Description']) # Write header
                writer.writerows(consolidated_patches) # Write data rows
            print("Successfully wrote patches to CSV.")
        except Exception as e:
            print(f"Error writing to CSV: {e}")
    else:
        print("\nNo specific patches found to write to CSV.")

except Exception as e:
    print(f"An error occurred during scraping or processing: {e}")