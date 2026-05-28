import requests
from bs4 import BeautifulSoup
import pandas as pd
from urllib.parse import urljoin, urlparse
import time
import re

# Initial seed URLs to start scraping, which will then recursively find other links
SEED_URLS = [
    "https://www.sarvodayafinance.lk/en",
    "https://www.sarvodayafinance.lk/en/careers",
    "https://www.sarvodayafinance.lk/en/media-center",
    "https://www.sarvodayafinance.lk/en/contact-us",
    "https://www.sarvodayafinance.lk/en/contact-us/branch-locator",
    "https://www.sarvodayafinance.lk/en/about-us",
    "https://www.sarvodayafinance.lk/en/leadership-team/board-of-directors",
    "https://www.sarvodayafinance.lk/en/leadership-team/corporate-management",
    "https://www.sarvodayafinance.lk/en/sarvodaya-movement",
    "https://www.sarvodayafinance.lk/en/products/sme-loans",
    "https://www.sarvodayafinance.lk/en/products/housing-loans",
    "https://www.sarvodayafinance.lk/en/products/micro-loans",
    "https://www.sarvodayafinance.lk/en/products/gold-loans",
    "https://www.sarvodayafinance.lk/en/products/vehicle-leasing",
    "https://www.sarvodayafinance.lk/en/products/machinery-equipment-leasing",
    "https://www.sarvodayafinance.lk/en/products/agro-leasing",
    "https://www.sarvodayafinance.lk/en/products/fixed-deposits",
    "https://www.sarvodayafinance.lk/en/products/fixed-saver",
    "https://www.sarvodayafinance.lk/en/products/daru-isuru",
    "https://www.sarvodayafinance.lk/en/products/pancha-children",
    "https://www.sarvodayafinance.lk/en/products/pensioner-savings",
    "https://www.sarvodayafinance.lk/en/products/general-savings",
    "https://www.sarvodayafinance.lk/en/community-impact",
    "https://www.sarvodayafinance.lk/en/investor-relations#latest",
    "https://www.sarvodayafinance.lk/en/investor-relations#annual-reports",
    "https://www.sarvodayafinance.lk/en/investor-relations#sustainability",
    "https://www.sarvodayafinance.lk/en/investor-relations#audit-reports",
    "https://www.sarvodayafinance.lk/en/investor-relations#interim-statements",
    "https://www.sarvodayafinance.lk/en/investor-relations#credit-rating",
    "https://www.sarvodayafinance.lk/en/investor-relations#policies",
    "https://www.sarvodayafinance.lk/en/investor-relations#publications",
    "https://www.sarvodayafinance.lk/en/investor-relations#other-downloads",
    "https://www.sarvodayafinance.lk/en/investor-relations#kfd",
    "https://www.sarvodayafinance.lk/en/investor-relations#agm"
]

DOMAIN = "www.sarvodayafinance.lk"
visited_urls = set()
to_visit_urls = set(SEED_URLS)
scraped_data = []

# Headers to act like a real browser
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
}

# Remove illegal characters for Excel
ILLEGAL_CHARACTERS_RE = re.compile(r'[\000-\010]|[\013-\014]|[\016-\037]')

def clean_text(text):
    """Removes extra whitespaces from the text"""
    if not text:
        return ""
    text = re.sub(r'\s+', ' ', text)
    text = ILLEGAL_CHARACTERS_RE.sub('', text)
    return text.strip()

def scrape_page(url):
    """Extracts all content from a given page"""
    # Prevent scraping inside PDF and Image files
    if any(url.lower().endswith(ext) for ext in ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx']):
        print(f"Skipping Document/Image -> {url}")
        return set()
        
    try:
        print(f"Scraping -> {url}")
        response = requests.get(url, headers=HEADERS, timeout=15)
        
        # Skip if URL is not reachable
        if response.status_code != 200:
            print(f"Failed (Status {response.status_code}): {url}")
            return set()
            
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # 1. Page Title
        title = soup.title.string if soup.title else ""
        
        # 2. Meta Description
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        meta_desc = meta_desc['content'] if meta_desc else ""
        
        # 3. Headings (H1, H2, H3)
        h1 = [clean_text(h.get_text()) for h in soup.find_all('h1')]
        h2 = [clean_text(h.get_text()) for h in soup.find_all('h2')]
        h3 = [clean_text(h.get_text()) for h in soup.find_all('h3')]
        
        # 4. Paragraphs (maintaining website order)
        paragraphs = []
        for p in soup.find_all(['p']):
            text = clean_text(p.get_text())
            if text and text not in paragraphs:
                paragraphs.append(text)
        
        # 5. List Items (maintaining bullet points order)
        list_items = []
        for li in soup.find_all('li'):
            text = clean_text(li.get_text())
            if text and text not in list_items:
                list_items.append(text)

        # 6. PDF / Download Links (extracting reports from pages like Investor Relations)
        pdf_links = []
        for a in soup.find_all('a', href=True):
            if '.pdf' in a['href'].lower():
                pdf_url = urljoin(url, a['href'])
                link_text = clean_text(a.get_text()) or "Download PDF"
                link_str = f"{link_text}: {pdf_url}"
                if link_str not in pdf_links:
                    pdf_links.append(link_str)
        
        # Aggregate scraped data
        scraped_data.append({
            "Page URL": url,
            "Title": clean_text(title),
            "Meta Description": clean_text(meta_desc),
            "H1 Headings": " | ".join(h1),
            "H2 Headings": " | ".join(h2),
            "H3 Headings": " | ".join(h3),
            "Full Paragraphs": "\n\n".join(paragraphs), # Joined ordered paragraphs
            "List/Bullet Points": "\n".join(list_items),
            "PDF Downloads": "\n".join(pdf_links) # Extracted PDF reports
        })
        
        # Find next links to visit
        new_links = set()
        for a_tag in soup.find_all("a", href=True):
            href = a_tag['href']
            
            # Skip fragment identifiers
            if href.startswith('#') or href.startswith('javascript:'):
                continue
                
            full_url = urljoin(url, href)
            parsed_url = urlparse(full_url)
            
            # Exclude external links (e.g., facebook, linkedin)
            if DOMAIN in parsed_url.netloc:
                # Get clean URL by removing query parameters and fragments
                clean_url = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
                new_links.add(clean_url)
                
        return new_links
        
    except Exception as e:
        print(f"Error scraping {url}: {str(e)}")
        return set()

def start_crawling(max_pages=200): # Maximum pages set to 200 by default
    print("--------------------------------------------------")
    print("Started Sarvodaya Finance Advanced Scraper...")
    print("--------------------------------------------------")
    
    pages_crawled = 0
    
    while to_visit_urls and pages_crawled < max_pages:
        current_url = to_visit_urls.pop()
        
        if current_url in visited_urls:
            continue
            
        visited_urls.add(current_url)
        pages_crawled += 1
        
        # Scrape page and get new links
        found_links = scrape_page(current_url)
        
        # Add new links to visit list
        for link in found_links:
            if link not in visited_urls:
                to_visit_urls.add(link)
                
        # Sleep for 1 second to avoid server blocking
        time.sleep(1)

    print("\n--------------------------------------------------")
    print(f"Crawling Complete! Total Pages: {pages_crawled}")
    print("Creating Excel file now...")
    
    # Generate Excel file using Pandas
    if scraped_data:
        df = pd.DataFrame(scraped_data)
        excel_filename = "Sarvodaya_Full_Content.xlsx"
        df.to_excel(excel_filename, index=False)
        print(f"Success! All data saved to '{excel_filename}'.")
    else:
        print("No data was scraped!")

if __name__ == "__main__":
    start_crawling(max_pages=1500) # Full site crawl override
