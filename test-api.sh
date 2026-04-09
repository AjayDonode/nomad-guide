source .env* 2>/dev/null
if [ -z "$GOOGLE_GENAI_API_KEY" ]; then
    GOOGLE_GENAI_API_KEY=AIzaSyCzyS1ypR9YZxHTXD2Ac5vvPCX8UJjiKmM
fi
curl -H "Content-Type: application/json" \
     -H "x-goog-api-key: $GOOGLE_GENAI_API_KEY" \
     -X POST -d '{"contents": [{"parts":[{"text": "Hello"}]}]}' \
     "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"
