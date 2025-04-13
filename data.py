
# pip install firecrawl
import os
from firecrawl import FirecrawlApp
from dotenv import load_dotenv
import json

load_dotenv()

app = FirecrawlApp(api_key=os.getenv("FIRECRAWL_API_KEY"))
  
# # Scrape a website:
# app.scrape_url('https://www.cursor.com/changelog')

# save the scrapped all data to txt
with open('cursor_changelog.txt', 'w') as f:
    f.write(json.dumps(app.scrape_url('https://www.cursor.com/changelog'), indent=4))
