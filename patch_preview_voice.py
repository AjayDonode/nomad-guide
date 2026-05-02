import re

with open('src/app/admin/page.tsx', 'r') as f:
    content = f.read()

# 1. Add state
state_search = "  const [playingPoiId, setPlayingPoiId] = useState<string | null>(null)"
state_replace = "  const [playingPoiId, setPlayingPoiId] = useState<string | null>(null)\n  const [previewVoice, setPreviewVoice] = useState<'male' | 'female' | 'male-hi' | 'female-hi'>('male')"
content = content.replace(state_search, state_replace)

# 2. Update handlePreviewAudio to use previewVoice
prev_search = """    let audioUri = null;
    let textToRead = item.text || "Audio unavailable.";
    if (voicePreference === 'male-hi') {
      audioUri = item.maleUrlHi;
      textToRead = item.textHi || textToRead;
    } else if (voicePreference === 'female-hi') {
      audioUri = item.femaleUrlHi;
      textToRead = item.textHi || textToRead;
    } else if (voicePreference === 'male') {
      audioUri = item.maleUrl;
    } else {
      audioUri = item.femaleUrl;
    }"""
prev_replace = """    let audioUri = null;
    let textToRead = item.text || "Audio unavailable.";
    if (previewVoice === 'male-hi') {
      audioUri = item.maleUrlHi;
      textToRead = item.textHi || textToRead;
    } else if (previewVoice === 'female-hi') {
      audioUri = item.femaleUrlHi;
      textToRead = item.textHi || textToRead;
    } else if (previewVoice === 'male') {
      audioUri = item.maleUrl;
    } else {
      audioUri = item.femaleUrl;
    }"""
content = content.replace(prev_search, prev_replace)

tts_search = "if (voicePreference.includes('hi')) utterance.lang = 'hi-IN';"
tts_replace = "if (previewVoice.includes('hi')) utterance.lang = 'hi-IN';"
content = content.replace(tts_search, tts_replace)

# 3. Add Select UI
ui_search = """              <Button 
                onClick={() => isPreviewing ? stopPreview() : handlePreviewAudio(0)}
                disabled={!canPlayPreview || (isPreviewing && !playerRef.current && typeof window !== 'undefined' && !window.speechSynthesis.speaking)}
                variant={canPlayPreview && (!isPreviewing || playerRef.current || (typeof window !== 'undefined' && window.speechSynthesis.speaking)) ? "default" : "ghost"}
                size="icon"
                className={cn(
                  "rounded-xl h-11 w-11 transition-all", 
                  isPreviewing ? "bg-primary/20 text-primary" : 
                  canPlayPreview ? "bg-green-500 text-white hover:bg-green-600 shadow-xl shadow-green-500/20" : 
                  "text-muted-foreground hover:bg-white/5 opacity-50"
                )}
              >
                {(isPreviewing && !playerRef.current && typeof window !== 'undefined' && !window.speechSynthesis.speaking) ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isPreviewing ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className={cn("w-5 h-5", canPlayPreview && "translate-x-0.5")} />
                )}
              </Button>"""

ui_replace = """              <div className="flex gap-2 items-center bg-white/5 p-1 rounded-2xl">
                <Select value={previewVoice} onValueChange={(val: any) => setPreviewVoice(val)}>
                  <SelectTrigger className="w-28 h-9 bg-transparent text-white text-[10px] uppercase font-bold border-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">MALE</SelectItem>
                    <SelectItem value="female">FEMALE</SelectItem>
                    <SelectItem value="male-hi">MALE (HINDI)</SelectItem>
                    <SelectItem value="female-hi">FEMALE (HINDI)</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => isPreviewing ? stopPreview() : handlePreviewAudio(0)}
                  disabled={!canPlayPreview || (isPreviewing && !playerRef.current && typeof window !== 'undefined' && !window.speechSynthesis.speaking)}
                  variant={canPlayPreview && (!isPreviewing || playerRef.current || (typeof window !== 'undefined' && window.speechSynthesis.speaking)) ? "default" : "ghost"}
                  size="icon"
                  className={cn(
                    "rounded-xl h-9 w-9 transition-all", 
                    isPreviewing ? "bg-primary/20 text-primary" : 
                    canPlayPreview ? "bg-green-500 text-white hover:bg-green-600 shadow-xl shadow-green-500/20" : 
                    "text-muted-foreground hover:bg-white/5 opacity-50"
                  )}
                >
                  {(isPreviewing && !playerRef.current && typeof window !== 'undefined' && !window.speechSynthesis.speaking) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isPreviewing ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className={cn("w-4 h-4", canPlayPreview && "translate-x-0.5")} />
                  )}
                </Button>
              </div>"""

content = content.replace(ui_search, ui_replace)

with open('src/app/admin/page.tsx', 'w') as f:
    f.write(content)
print("Added previewVoice state and Select dropdown")
