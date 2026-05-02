import re

with open('src/app/admin/page.tsx', 'r') as f:
    content = f.read()

search_str = """                        {/* ── Narration Script Section ── */}
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                              Voice Script
                              {(poi.audioMaleDataUri || poi.audioFemaleDataUri) && (
                                <span className="ml-2 text-emerald-400">● Live</span>
                              )}
                            </Label>
                            {/* ✨ Step 1: Generate suggested text */}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={generatingTextPoiId === poi.id}
                              onClick={() => handleGeneratePoiText(poi, idx)}
                              className="h-7 px-3 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg uppercase tracking-wider"
                            >
                              {generatingTextPoiId === poi.id
                                ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                : <Sparkles className="w-3 h-3 mr-1" />}
                              Suggest Script
                            </Button>
                          </div>
                          {/* Editable intro text */}
                          <Textarea
                            ref={(el) => { poiTextareaRefs.current[poi.id] = el }}
                            value={poiDraftTexts[poi.id] ?? (poi.narrationText || "")}
                            onChange={(e) => setPoiDraftTexts(prev => ({ ...prev, [poi.id]: e.target.value }))}
                            placeholder="Click ✨ Suggest Script, or write narration here. Use Sound Library in the sidebar to add <sound> tags."
                            className="bg-white/5 border-white/10 rounded-xl text-xs min-h-[60px] focus:border-emerald-500/40 text-slate-200 placeholder:text-white/20"
                          />

                          {/* 🔊 Step 2: Publish audio from the script */}
                          <Button
                            onClick={() => handlePublishSinglePoiAudio(poi)}
                            disabled={publishingAudioPoiId === poi.id || !(poiDraftTexts[poi.id] || poi.narrationText)}
                            className={cn(
                              "w-full h-9 rounded-xl text-xs font-bold border-none transition-all mt-4",
                              (poiDraftTexts[poi.id] || poi.narrationText)
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/30"
                                : "bg-white/5 text-muted-foreground cursor-not-allowed"
                            )}
                          >
                            {publishingAudioPoiId === poi.id ? (
                              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Publishing Audio...</>
                            ) : (
                              <><Volume2 className="w-3.5 h-3.5 mr-2" />Publish Voice (Both Tracks)</>
                            )}
                          </Button>

                          {/* 🌐 Hindi Translation Section */}
                          <div className="mt-6 pt-6 border-t border-white/5">
                            <div className="flex items-center justify-between mb-3">
                              <Label className="text-[10px] uppercase tracking-[0.1em] text-orange-200/70 font-bold flex items-center">
                                <span className="text-orange-400 mr-2 font-black text-xs">Aअ</span> Hindi Translation
                              </Label>
                              <Button
                                onClick={() => handleTranslatePoi(poi.id)}
                                disabled={translatingPoiId === poi.id || !(poiDraftTexts[poi.id] || poi.narrationText)}
                                className="h-6 text-[10px] uppercase font-bold bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-none rounded-lg px-2"
                              >
                                {translatingPoiId === poi.id ? "Translating..." : "Auto Translate"}
                              </Button>
                            </div>
                            
                            <Textarea
                              value={poiDraftTextsHi[poi.id] ?? (poi.narrationTextHi || "")}
                              onChange={(e) => setPoiDraftTextsHi(prev => ({ ...prev, [poi.id]: e.target.value }))}
                              placeholder="Hindi translation will appear here..."
                              className="bg-white/5 border-white/10 rounded-xl text-xs min-h-[60px] focus:border-orange-500/40 text-slate-200 placeholder:text-white/20"
                            />
                            
                            <Button
                              onClick={() => handlePublishPoiAudioHi(poi.id)}
                              disabled={publishingPoiId === poi.id || !(poiDraftTextsHi[poi.id] || poi.narrationTextHi)}
                              className={cn(
                                "w-full h-9 rounded-xl text-xs font-bold border-none transition-all mt-4",
                                (poiDraftTextsHi[poi.id] || poi.narrationTextHi)
                                  ? "bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-900/30"
                                  : "bg-white/5 text-muted-foreground cursor-not-allowed"
                              )}
                            >
                              {publishingPoiId === poi.id ? (
                                <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Publishing...</>
                              ) : (
                                <><Volume2 className="w-3.5 h-3.5 mr-2" />Publish Hindi Audio</>
                              )}
                            </Button>
                          </div>
                        </div>"""

replace_str = """                        {/* ── Narration Script Section ── */}
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3 space-y-2">
                          {workspaceLang === 'en' ? (
                            <>
                              <div className="flex items-center justify-between">
                                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                                  Voice Script
                                  {(poi.audioMaleDataUri || poi.audioFemaleDataUri) && (
                                    <span className="ml-2 text-emerald-400">● Live</span>
                                  )}
                                </Label>
                                {/* ✨ Step 1: Generate suggested text */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={generatingTextPoiId === poi.id}
                                  onClick={() => handleGeneratePoiText(poi, idx)}
                                  className="h-7 px-3 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg uppercase tracking-wider"
                                >
                                  {generatingTextPoiId === poi.id
                                    ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    : <Sparkles className="w-3 h-3 mr-1" />}
                                  Suggest Script
                                </Button>
                              </div>
                              {/* Editable intro text */}
                              <Textarea
                                ref={(el) => { poiTextareaRefs.current[poi.id] = el }}
                                value={poiDraftTexts[poi.id] ?? (poi.narrationText || "")}
                                onChange={(e) => setPoiDraftTexts(prev => ({ ...prev, [poi.id]: e.target.value }))}
                                placeholder="Click ✨ Suggest Script, or write narration here. Use Sound Library in the sidebar to add <sound> tags."
                                className="bg-white/5 border-white/10 rounded-xl text-xs min-h-[60px] focus:border-emerald-500/40 text-slate-200 placeholder:text-white/20"
                              />

                              {/* 🔊 Step 2: Publish audio from the script */}
                              <Button
                                onClick={() => handlePublishSinglePoiAudio(poi)}
                                disabled={publishingAudioPoiId === poi.id || !(poiDraftTexts[poi.id] || poi.narrationText)}
                                className={cn(
                                  "w-full h-9 rounded-xl text-xs font-bold border-none transition-all mt-4",
                                  (poiDraftTexts[poi.id] || poi.narrationText)
                                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/30"
                                    : "bg-white/5 text-muted-foreground cursor-not-allowed"
                                )}
                              >
                                {publishingAudioPoiId === poi.id ? (
                                  <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Publishing Audio...</>
                                ) : (
                                  <><Volume2 className="w-3.5 h-3.5 mr-2" />Publish Voice (Both Tracks)</>
                                )}
                              </Button>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-1">
                                <Label className="text-[10px] uppercase tracking-[0.1em] text-orange-200/70 font-bold flex items-center">
                                  <span className="text-orange-400 mr-2 font-black text-xs">Aअ</span> Hindi Translation
                                  {(poi.audioMaleDataUriHi || poi.audioFemaleDataUriHi) && (
                                    <span className="ml-2 text-orange-400">● Live</span>
                                  )}
                                </Label>
                                <Button
                                  onClick={() => handleTranslatePoi(poi.id)}
                                  disabled={translatingPoiId === poi.id || !(poiDraftTexts[poi.id] || poi.narrationText)}
                                  className="h-6 text-[10px] uppercase font-bold bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-none rounded-lg px-2"
                                >
                                  {translatingPoiId === poi.id ? "Translating..." : "Auto Translate"}
                                </Button>
                              </div>
                              
                              <Textarea
                                value={poiDraftTextsHi[poi.id] ?? (poi.narrationTextHi || "")}
                                onChange={(e) => setPoiDraftTextsHi(prev => ({ ...prev, [poi.id]: e.target.value }))}
                                placeholder="Hindi translation will appear here..."
                                className="bg-white/5 border-white/10 rounded-xl text-xs min-h-[60px] focus:border-orange-500/40 text-slate-200 placeholder:text-white/20"
                              />
                              
                              <Button
                                onClick={() => handlePublishPoiAudioHi(poi.id)}
                                disabled={publishingPoiId === poi.id || !(poiDraftTextsHi[poi.id] || poi.narrationTextHi)}
                                className={cn(
                                  "w-full h-9 rounded-xl text-xs font-bold border-none transition-all mt-4",
                                  (poiDraftTextsHi[poi.id] || poi.narrationTextHi)
                                    ? "bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-900/30"
                                    : "bg-white/5 text-muted-foreground cursor-not-allowed"
                                )}
                              >
                                {publishingPoiId === poi.id ? (
                                  <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Publishing...</>
                                ) : (
                                  <><Volume2 className="w-3.5 h-3.5 mr-2" />Publish Hindi Audio</>
                                )}
                              </Button>
                            </>
                          )}
                        </div>"""

content = content.replace(search_str, replace_str)

with open('src/app/admin/page.tsx', 'w') as f:
    f.write(content)

print("Updated POI UI conditionals")
