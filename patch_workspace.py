import re

with open('src/app/admin/page.tsx', 'r') as f:
    content = f.read()

# 1. Add workspaceLang state
state_search = "const [translatingPoiId, setTranslatingPoiId] = useState<string | null>(null)"
state_replace = "const [translatingPoiId, setTranslatingPoiId] = useState<string | null>(null)\n  const [workspaceLang, setWorkspaceLang] = useState<'en' | 'hi'>('en')"
content = content.replace(state_search, state_replace)

# 2. Add Radio/Toggle UI above Trip Strategy
ui_top_search = """              <div className="flex items-center gap-2 mb-2">
                <Music className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-primary">Trip Strategy</h2>
              </div>"""

ui_top_replace = """              <div className="flex items-center justify-between mb-4 bg-white/5 p-1 rounded-xl">
                <button
                  onClick={() => setWorkspaceLang('en')}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${workspaceLang === 'en' ? 'bg-emerald-600 text-white shadow-md' : 'text-muted-foreground hover:bg-white/5'}`}
                >
                  🇬🇧 English Workspace
                </button>
                <button
                  onClick={() => setWorkspaceLang('hi')}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${workspaceLang === 'hi' ? 'bg-orange-600 text-white shadow-md' : 'text-muted-foreground hover:bg-white/5'}`}
                >
                  🇮🇳 Hindi Workspace
                </button>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Music className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-primary">Trip Strategy</h2>
              </div>"""
content = content.replace(ui_top_search, ui_top_replace)

# 3. Refactor POI Narration UI
# I will use a regex to match the entire textarea + English buttons + Hindi Translation Section block
# and replace it with a conditional rendering based on workspaceLang.
