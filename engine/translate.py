# Translation is now handled inside free_pipeline.py via YouTube's free transcript translation.
# Kept for compatibility with the old entry point; no paid API is used.
from free_pipeline import main
if __name__ == '__main__':
    main()
