import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import FirecrawlApp from "@mendable/firecrawl-js";

interface ChangelogEntry {
  version: string;
  description: string;
}

const DATA_DIR = join(homedir(), ".cursor-changelog");
const CHANGELOG_FILE = join(DATA_DIR, "changelog.json");

// Ensure data directory exists
const ensureDataDir = (): void => {
  if (!existsSync(DATA_DIR)) {
    const fs = require("fs");
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

// Clean up a description string
const cleanDescription = (desc: string): string => {
  desc = desc.trim();
  
  // Remove leading punctuation that indicates this is a partial description
  desc = desc.replace(/^[.,:;\-)\]]+\s*/, "");
  
  // Replace markdown links with just the text
  desc = desc.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  
  // Remove URLs  
  desc = desc.replace(/https?:\/\/\S+/g, "");
  
  // Remove markdown heading markers
  desc = desc.replace(/^##\s*/, "");
  
  // Remove artifacts from abbreviated ranges
  desc = desc.replace(/^\d+\):\s*/, "");
  
  // Clean up other non-descriptive artifacts
  desc = desc.replace(/^[):\]\[]+\s*/, "");
  
  // Remove words like "nightly" at the beginning of descriptions
  desc = desc.replace(/^nightly\s*/i, "");
  
  // Replace newlines with spaces to make it a single paragraph
  desc = desc.replace(/\s*\n\s*/g, " ");
  
  // Remove extra spaces
  desc = desc.replace(/\s+/g, " ");
  
  // Check for descriptions that seem incomplete
  if (desc.startsWith("of ") || desc.startsWith("until ")) {
    return "";
  }
  
  return desc.trim();
};

// Find individual patch descriptions from formatted lines
const extractIndividualPatches = (content: string): Record<string, string> => {
  const patches: Record<string, string> = {};
  
  // Pattern to match version numbers followed by descriptions
  const pattern = /(\d+\.\d+\.\d+)\s*:?\s*-?\s*([^-:0-9][^0-9]*?)(?=\s*-\s*\d+\.\d+\.\d+|\n|$)/g;
  
  // Find all matches throughout the content
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const [, version, desc] = match;
    
    // Skip if not starting with 0.
    if (!version.startsWith("0.")) {
      continue;
    }
    
    const cleanDesc = cleanDescription(desc);
    if (cleanDesc && cleanDesc.length > 10) {  // Ensure meaningful description
      patches[version] = cleanDesc;
    }
  }
  
  return patches;
};

// Consolidate versions with identical descriptions into version ranges
const consolidateVersions = (patchesDict: Record<string, string>): ChangelogEntry[] => {
  // Invert the dictionary: group versions by description
  const groupedByDesc: Record<string, string[]> = {};
  for (const [version, desc] of Object.entries(patchesDict)) {
    if (!groupedByDesc[desc]) {
      groupedByDesc[desc] = [];
    }
    groupedByDesc[desc].push(version);
  }
  
  const consolidated: ChangelogEntry[] = [];
  
  for (const [desc, versions] of Object.entries(groupedByDesc)) {
    // Skip entries without meaningful descriptions
    if (!desc || desc.length < 10) {
      continue;
    }
    
    // Sort versions to find consecutive ranges
    // Only consider 0.xx.yy versions (not 1.xx which are likely false positives)
    const validVersions = versions.filter(v => v.startsWith("0."));
    
    if (validVersions.length === 0) {
      continue;
    }
    
    validVersions.sort((a, b) => {
      const aParts = a.split(".").map(n => isNaN(parseInt(n)) ? 0 : parseInt(n));
      const bParts = b.split(".").map(n => isNaN(parseInt(n)) ? 0 : parseInt(n));
      
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal !== bVal) {
          return aVal - bVal;
        }
      }
      return 0;
    });
    
    // Group consecutive versions
    const ranges: string[][] = [];
    let currentRange = [validVersions[0]];
    
    // Function to extract major.minor.patch as integers
    const versionParts = (v: string): number[] => {
      return v.split(".").map(p => isNaN(parseInt(p)) ? 0 : parseInt(p));
    };
    
    for (let i = 1; i < validVersions.length; i++) {
      const prevParts = versionParts(validVersions[i-1]);
      const currParts = versionParts(validVersions[i]);
      
      // Check if versions are consecutive
      if (prevParts.length === 3 && currParts.length === 3 &&
          prevParts[0] === currParts[0] &&
          prevParts[1] === currParts[1] &&
          prevParts[2] + 1 === currParts[2]) {
        currentRange.push(validVersions[i]);
      } else {
        ranges.push(currentRange);
        currentRange = [validVersions[i]];
      }
    }
    
    ranges.push(currentRange);
    
    // Convert ranges to version strings
    for (const rangeGroup of ranges) {
      if (rangeGroup.length === 1) {
        consolidated.push({ version: rangeGroup[0], description: desc });
      } else {
        const rangeStr = `${rangeGroup[0]}-${rangeGroup[rangeGroup.length - 1]}`;
        consolidated.push({ version: rangeStr, description: desc });
      }
    }
  }
  
  // Sort consolidated list by version (newest first)
  const getVersionTuple = (versionStr: string): number[] => {
    // Handle ranges by taking the latest version in the range
    if (versionStr.includes("-")) {
      versionStr = versionStr.split("-")[1];
    }
    
    // Handle x versions by assuming they are the largest in their series
    versionStr = versionStr.replace("x", "999");
    
    // Convert version to tuple of integers for sorting
    const parts = versionStr.split(".");
    return parts.map(p => isNaN(parseInt(p)) ? 0 : parseInt(p));
  };
  
  consolidated.sort((a, b) => {
    const aTuple = getVersionTuple(a.version);
    const bTuple = getVersionTuple(b.version);
    
    for (let i = 0; i < Math.max(aTuple.length, bTuple.length); i++) {
      const aVal = aTuple[i] || 0;
      const bVal = bTuple[i] || 0;
      if (aVal !== bVal) {
        return bVal - aVal; // Newest first
      }
    }
    return 0;
  });
  
  return consolidated;
};

// Scrape and process the changelog
export const updateChangelog = async (apiKey: string): Promise<ChangelogEntry[]> => {
  try {
    ensureDataDir();
    
    const app = new FirecrawlApp({ apiKey });
    
    console.log("Scraping changelog...");
    const response = await app.scrapeUrl("https://www.cursor.com/changelog");
    
    // Use type assertion to access the response properties
    const anyResponse = response as any;
    
    if (anyResponse.error) {
      throw new Error(`Firecrawl error: ${anyResponse.error}`);
    }
    
    // Extract markdown content
    const markdownContent = anyResponse.markdown ?? "";
    
    if (!markdownContent) {
      throw new Error("Could not retrieve markdown content");
    }
    
    console.log("Processing content...");
    const allPatches: Record<string, string> = {};
    
    // Extract from lines like "0.47.1: Description - 0.47.2: Another description"
    const individualPatches = extractIndividualPatches(markdownContent);
    Object.assign(allPatches, individualPatches);
    
    // Look for specific version patterns at the start of lines
    const patchPattern = /(?:^|\n)(\d+\.\d+\.\d+)\s*:?\s*-?\s*([^-:0-9][^0-9\n]*?)(?=\n|$)/g;
    let patchMatch;
    
    while ((patchMatch = patchPattern.exec(markdownContent)) !== null) {
      const [, version, desc] = patchMatch;
      
      // Skip if not starting with 0.
      if (!version.startsWith("0.")) {
        continue;
      }
      
      const cleanDesc = cleanDescription(desc);
      if (cleanDesc && cleanDesc.length > 10) {
        // Prefer longer descriptions if we already have one
        if (!allPatches[version] || cleanDesc.length > allPatches[version].length) {
          allPatches[version] = cleanDesc;
        }
      }
    }
    
    // Handle listings in the Patches section
    const patchesSectionPattern = /(?:###\s*Patches|\*\*Patches\*\*)(.*?)(?=###|\*\*[A-Z]|\Z)/gs;
    let sectionMatch;
    
    while ((sectionMatch = patchesSectionPattern.exec(markdownContent)) !== null) {
      const patchesSection = sectionMatch[1].trim();
      // Extract individual patches
      const sectionPatches = extractIndividualPatches(patchesSection);
      
      for (const [version, desc] of Object.entries(sectionPatches)) {
        if (!allPatches[version] || desc.length > allPatches[version].length) {
          allPatches[version] = desc;
        }
      }
    }
    
    // Handle major version headers like "0.48.x"
    const majorVersionPattern = /(?:^|\n)(\d+\.\d+\.x)[\n\s]+(.*?)(?=\n\n|\n\d+\.\d+\.|\Z)/gs;
    let majorMatch;
    
    while ((majorMatch = majorVersionPattern.exec(markdownContent)) !== null) {
      const [, version, fullDesc] = majorMatch;
      
      // Skip if not starting with 0.
      if (!version.startsWith("0.")) {
        continue;
      }
      
      const desc = cleanDescription(fullDesc);
      if (desc && !allPatches[version]) {
        allPatches[version] = desc;
      }
    }
    
    // Remove entries with invalid descriptions
    for (const version of Object.keys(allPatches)) {
      const desc = allPatches[version];
      // Check for descriptions that are just markdown syntax or brackets or too short
      if (["](", "]", ")", "](http", ":", ""].includes(desc) || desc.length < 10) {
        delete allPatches[version];
      }
    }
    
    // Consolidate versions with identical descriptions into ranges
    const changelog = consolidateVersions(allPatches);
    
    // Save to file
    writeFileSync(CHANGELOG_FILE, JSON.stringify(changelog, null, 2));
    
    return changelog;
  } catch (error) {
    console.error(`An error occurred during scraping or processing: ${error}`);
    throw error;
  }
};

// Load the changelog from file
export const loadChangelog = (): ChangelogEntry[] => {
  ensureDataDir();
  
  if (!existsSync(CHANGELOG_FILE)) {
    return [];
  }
  
  try {
    const data = readFileSync(CHANGELOG_FILE, "utf-8");
    return JSON.parse(data) as ChangelogEntry[];
  } catch (error) {
    console.error(`Error loading changelog: ${error}`);
    return [];
  }
};

// Get the latest version entry
export const getLatestVersion = (): ChangelogEntry | null => {
  const changelog = loadChangelog();
  
  if (changelog.length === 0) {
    return null;
  }
  
  // Find the first entry that doesn't include 'x' (specific version, not a major version)
  for (const entry of changelog) {
    if (!entry.version.includes("x")) {
      return entry;
    }
  }
  
  // Fallback to the first entry if no specific version is found
  return changelog[0];
}; 