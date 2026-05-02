import re

with open('src/components/admin/admin-map.tsx', 'r') as f:
    content = f.read()

# 1. Update props
props_search = "  translatingLegId?: string | null\n}"
props_replace = "  translatingLegId?: string | null\n  workspaceLang?: 'en' | 'hi'\n}"
content = content.replace(props_search, props_replace)

destruct_search = "  legDraftTextsHi, onLegNarrationHiChange, onTranslateLeg, onPublishLegAudioHi, translatingLegId\n}: AdminMapProps) {"
destruct_replace = "  legDraftTextsHi, onLegNarrationHiChange, onTranslateLeg, onPublishLegAudioHi, translatingLegId, workspaceLang = 'en'\n}: AdminMapProps) {"
content = content.replace(destruct_search, destruct_replace)

# 2. Conditionally render popup UI
popup_search = """                    <textarea 
                      className="w-full h-24 p-2 text-xs border rounded bg-slate-50 mb-2"
                      value={legDraftTexts?.[trigger.id] !== undefined ? legDraftTexts[trigger.id] : (trigger.text || "")}
                      onChange={(e) => onLegNarrationChange?.(poi.id, trigger.id, e.target.value)}
                      placeholder="Enter narration to play at this point..."
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => onPublishLegAudio?.(poi.id, trigger.id)}
                        className="text-white bg-purple-600 hover:bg-purple-700 text-[10px] uppercase tracking-wider font-bold py-1.5 px-3 rounded flex-1"
                      >
                        Publish Audio
                      </button>
                      {onLegTriggerDelete && (
                         <button
                           onClick={() => onLegTriggerDelete(poi.id, trigger.id)}
                           className="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] uppercase tracking-wider font-bold py-1.5 px-2 rounded"
                         >
                           Delete
                         </button>
                      )}
                    </div>

                    {/* Hindi Translation */}
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                         <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider flex items-center"><span className="mr-1 text-xs font-black">Aअ</span> Hindi</span>
                         <button 
                           onClick={() => onTranslateLeg?.(poi.id, trigger.id)}
                           disabled={translatingLegId === trigger.id}
                           className="text-[9px] bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold px-2 py-1 rounded"
                         >
                           {translatingLegId === trigger.id ? "Translating..." : "Auto Translate"}
                         </button>
                      </div>
                      <textarea 
                        className="w-full h-16 p-2 text-xs border rounded bg-slate-50 mb-2"
                        value={legDraftTextsHi?.[trigger.id] !== undefined ? legDraftTextsHi[trigger.id] : (trigger.textHi || "")}
                        onChange={(e) => onLegNarrationHiChange?.(poi.id, trigger.id, e.target.value)}
                        placeholder="Hindi translation..."
                      />
                      <button
                        onClick={() => onPublishLegAudioHi?.(poi.id, trigger.id)}
                        className="w-full text-white bg-orange-500 hover:bg-orange-600 text-[10px] uppercase tracking-wider font-bold py-1.5 px-3 rounded"
                      >
                        Publish Hindi Audio
                      </button>
                    </div>"""

popup_replace = """                    {workspaceLang === 'en' ? (
                      <>
                        <textarea 
                          className="w-full h-24 p-2 text-xs border rounded bg-slate-50 mb-2"
                          value={legDraftTexts?.[trigger.id] !== undefined ? legDraftTexts[trigger.id] : (trigger.text || "")}
                          onChange={(e) => onLegNarrationChange?.(poi.id, trigger.id, e.target.value)}
                          placeholder="Enter narration to play at this point..."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => onPublishLegAudio?.(poi.id, trigger.id)}
                            className="text-white bg-purple-600 hover:bg-purple-700 text-[10px] uppercase tracking-wider font-bold py-1.5 px-3 rounded flex-1"
                          >
                            Publish Audio
                          </button>
                          {onLegTriggerDelete && (
                             <button
                               onClick={() => onLegTriggerDelete(poi.id, trigger.id)}
                               className="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] uppercase tracking-wider font-bold py-1.5 px-2 rounded"
                             >
                               Delete
                             </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider flex items-center"><span className="mr-1 text-xs font-black">Aअ</span> Hindi</span>
                           <button 
                             onClick={() => onTranslateLeg?.(poi.id, trigger.id)}
                             disabled={translatingLegId === trigger.id}
                             className="text-[9px] bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold px-2 py-1 rounded"
                           >
                             {translatingLegId === trigger.id ? "Translating..." : "Auto Translate"}
                           </button>
                        </div>
                        <textarea 
                          className="w-full h-24 p-2 text-xs border rounded bg-orange-50/50 mb-2 focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                          value={legDraftTextsHi?.[trigger.id] !== undefined ? legDraftTextsHi[trigger.id] : (trigger.textHi || "")}
                          onChange={(e) => onLegNarrationHiChange?.(poi.id, trigger.id, e.target.value)}
                          placeholder="Hindi translation..."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => onPublishLegAudioHi?.(poi.id, trigger.id)}
                            className="w-full text-white bg-orange-500 hover:bg-orange-600 text-[10px] uppercase tracking-wider font-bold py-1.5 px-3 rounded flex-1"
                          >
                            Publish Hindi Audio
                          </button>
                          {onLegTriggerDelete && (
                             <button
                               onClick={() => onLegTriggerDelete(poi.id, trigger.id)}
                               className="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] uppercase tracking-wider font-bold py-1.5 px-2 rounded"
                             >
                               Delete
                             </button>
                          )}
                        </div>
                      </>
                    )}"""

content = content.replace(popup_search, popup_replace)

with open('src/components/admin/admin-map.tsx', 'w') as f:
    f.write(content)
print("Updated admin-map to use workspaceLang conditional logic")
