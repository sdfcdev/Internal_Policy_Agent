import pandas as pd
import json
import asyncio
import os
import sys
import types
from dotenv import load_dotenv

# --- HOTFIX FOR RAGAS + NEW LANGCHAIN ---
# Ragas internally tries to import VertexAI from the old langchain_community location
try:
    import langchain_community.chat_models
    mock_vertex = types.ModuleType("langchain_community.chat_models.vertexai")
    sys.modules["langchain_community.chat_models.vertexai"] = mock_vertex
    mock_vertex.ChatVertexAI = None
except Exception:
    pass
# ----------------------------------------

# Import RAGAS and HuggingFace Datasets
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper

# Import our LangChain VertexAI models
from langchain_google_vertexai import ChatVertexAI, VertexAIEmbeddings

# Import our actual Agent Graph from main.py to get the real AI answers
from main import graph

load_dotenv()

async def run_evaluation():
    print("\n[STEP 1] Loading Evaluation Dataset (ragas_evaluation_dataset.csv)...")
    try:
        df = pd.read_csv("ragas_evaluation_dataset.csv")
    except Exception as e:
        print(f"Error loading CSV: {e}")
        return

    questions = df['question'].tolist()
    ground_truths = df['ground_truth'].tolist()
    
    answers = []
    contexts = []
    
    print(f"\n[STEP 2] Generating AI Answers for {len(questions)} questions...")
    print("This will run your AI Agent (Retrieval + Generation) for each question. Please wait...\n")
    
    for i, q in enumerate(questions):
        print(f"   ({i+1}/{len(questions)}) Asking: {q}")
        
        initial_state = {
            "query": q,
            "employee_id": "evaluator",
            "session_id": "eval_session",
            "save_chat": False,
            "history": "",
            "retrieved_chunks": [],
            "draft_response": "",
            "final_response": "",
            "hallucination_check": "",
            "accuracy_score": "",
            "reviewer_feedback": "",
            "rewrite_count": 0,
            "allowed_filenames": []
        }
        
        try:
            # Run our LangGraph pipeline
            result = graph.invoke(initial_state)
            
            ans = result.get("final_response") or result.get("draft_response") or "No answer generated"
            ctx = result.get("retrieved_chunks", [])
            
            # Ragas expects contexts as a list of strings
            if not isinstance(ctx, list):
                ctx = [str(ctx)]
            if len(ctx) == 0:
                ctx = ["No context retrieved"]
                
        except Exception as e:
            print(f"      [Error]: {e}")
            ans = "Error generating response"
            ctx = ["Error retrieving context"]
            
        answers.append(ans)
        contexts.append(ctx)
        
    print("\n[STEP 3] Preparing Data for RAGAS Examiner...")
    data = {
        "question": questions,
        "answer": answers,
        "contexts": contexts,
        "ground_truth": ground_truths
    }
    
    # Convert to HuggingFace Dataset format required by Ragas
    dataset = Dataset.from_dict(data)
    
    print("\n[STEP 4] Initializing RAGAS Models (Google Vertex AI)...")
    # We use Vertex AI as the "Examiner" to grade the answers
    base_llm = ChatVertexAI(model_name="gemini-2.5-flash", location="global", temperature=0)
    base_emb = VertexAIEmbeddings(model_name="text-embedding-004", location="us-central1")
    
    ragas_llm = LangchainLLMWrapper(base_llm)
    ragas_emb = LangchainEmbeddingsWrapper(base_emb)
    
    print("\n[STEP 5] Running RAGAS Evaluation... (This takes time as it grades Faithfulness, Relevancy, etc.)")
    try:
        result = evaluate(
            dataset,
            metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
            llm=ragas_llm,
            embeddings=ragas_emb,
            raise_exceptions=False
        )
        
        print("\n================ RAGAS EVALUATION SUMMARY ================")
        print(result)
        print("==========================================================\n")
        
        print("[STEP 6] Saving detailed results to 'ragas_results.csv'...")
        df_result = result.to_pandas()
        df_result.to_csv("ragas_results.csv", index=False)
        print("✅ DONE! Open 'ragas_results.csv' in Excel to see the grades for each question!")
        
    except Exception as e:
        print(f"\n❌ RAGAS Evaluation Failed: {e}")
        print("Make sure your Vertex AI credentials are set correctly.")

if __name__ == "__main__":
    asyncio.run(run_evaluation())
