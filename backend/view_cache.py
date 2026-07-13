import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import get_semantic_cache

def view_cache():
    print("Loading Semantic Cache from ChromaDB...")
    try:
        sc = get_semantic_cache()
        cache_data = sc.get()
        
        documents = cache_data.get('documents', [])
        metadatas = cache_data.get('metadatas', [])
        
        total_cached = len(documents)
        print(f"\n=== Total Cached Queries: {total_cached} ===\n")
        
        if total_cached == 0:
            print("The cache is currently empty.")
            return

        for i, (query, meta) in enumerate(zip(documents, metadatas), 1):
            print(f"[{i}] QUERY: {query}")
            print(f"    ACCURACY SCORE: {meta.get('accuracy', 'N/A')}")
            # Print first 100 characters of the answer for preview
            answer_preview = meta.get('answer', '')[:100].replace('\n', ' ')
            print(f"    ANSWER: {answer_preview}...")
            print("-" * 60)
            
    except Exception as e:
        print(f"Error reading cache: {e}")

if __name__ == "__main__":
    view_cache()
