import re

with open('src/app/admin/page.tsx', 'r') as f:
    content = f.read()

# 1. Update state
state_search = """    welcomeAudioText: "",
    coverImage: null as string | null,"""
state_replace = """    welcomeAudioText: "",
    welcomeAudioTextHi: "",
    introNarrationMaleUrlHi: null as string | null,
    introNarrationFemaleUrlHi: null as string | null,
    coverImage: null as string | null,"""
content = content.replace(state_search, state_replace)

# 2. Add Hindi Handlers
handlers_search = """  const handlePublishIntroAudio = async () => {
    if (!firestore || !tripId || !tripData.welcomeAudioText) return;"""
handlers_replace = """  const [translatingWelcome, setTranslatingWelcome] = useState(false);
  const handleTranslateWelcome = async () => {
    if (!tripData.welcomeAudioText) return;
    setTranslatingWelcome(true);
    try {
      const translated = await translateToHindi({ text: tripData.welcomeAudioText });
      if (translated?.hindiTranslation) {
        setTripData(prev => ({ ...prev, welcomeAudioTextHi: translated.hindiTranslation }));
        if (firestore && tripId) {
           await updateDoc(doc(firestore, 'trips', tripId), { welcomeAudioTextHi: translated.hindiTranslation });
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Translation failed', variant: 'destructive' });
    } finally {
      setTranslatingWelcome(false);
    }
  }

  const handlePublishWelcomeHi = async () => {
    if (!firestore || !tripId || !tripData.welcomeAudioTextHi) return;
    setPublishingIntroAudio(true);
    try {
      const { maleUrl, femaleUrl } = await callPublishVoice({
         tripId,
         text: tripData.welcomeAudioTextHi,
         assetId: 'intro-hi',
         voiceType: 'both-hi'
      });
      setTripData(prev => ({ ...prev, introNarrationMaleUrlHi: maleUrl, introNarrationFemaleUrlHi: femaleUrl }));
      await updateDoc(doc(firestore, 'trips', tripId), {
         introNarrationMaleUrlHi: maleUrl,
         introNarrationFemaleUrlHi: femaleUrl
      });
      toast({ title: 'Hindi Welcome Audio published' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Failed to publish audio', variant: 'destructive' });
    } finally {
      setPublishingIntroAudio(false);
    }
  }

  const handlePublishIntroAudio = async () => {
    if (!firestore || !tripId || !tripData.welcomeAudioText) return;"""
content = content.replace(handlers_search, handlers_replace)

# 3. Refactor UI
ui_search = """              <section className="space-y-4">
                <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Tour Welcome Audio</Label>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Write the exact script the driver should hear when they tap GO to begin the tour.
                  </p>
                  <Textarea 
                    value={tripData.welcomeAudioText || ''}
                    onChange={(e) => setTripData({...tripData, welcomeAudioText: e.target.value})}
                    placeholder="Welcome to Yosemite! Today we will explore..."
                    className="bg-black/30 border-white/10 rounded-xl h-10 min-h-[40px] focus:min-h-[120px] transition-all py-2 px-3 text-sm"
                  />
                  <div className="flex gap-2 items-center pt-2">
                    {(tripData.introNarrationMaleUrl || tripData.introNarrationFemaleUrl) && (
                      <Button
                        onClick={() => handlePlaySpecificAudio(voicePreference === 'male' ? tripData.introNarrationMaleUrl : tripData.introNarrationFemaleUrl)}
                        className="h-9 w-10 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl border-none flex items-center justify-center p-0 shrink-0"
                      >
                        {playingSpecificAudioUrl === (voicePreference === 'male' ? tripData.introNarrationMaleUrl : tripData.introNarrationFemaleUrl)
                          ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                    )}
                    <div className="flex-1">
                      <Button 
                        onClick={handlePublishIntroAudio}
                        disabled={publishingIntroAudio || !tripData.welcomeAudioText}
                        className={cn(
                          "w-full h-9 rounded-xl text-xs font-bold transition-all border-none",
                          tripData.welcomeAudioText 
                            ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30" 
                            : "bg-white/10 text-muted-foreground"
                        )}
                      >
                        {publishingIntroAudio ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Publishing...</>
                        ) : (
                          <><Volume2 className="w-3.5 h-3.5 mr-2" /> Publish Welcome Audio (Both Voices)</>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </section>"""

ui_replace = """              <section className="space-y-4">
                <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Tour Welcome Audio</Label>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  {workspaceLang === 'en' ? (
                    <>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Write the exact script the driver should hear when they tap GO to begin the tour.
                      </p>
                      <Textarea 
                        value={tripData.welcomeAudioText || ''}
                        onChange={(e) => setTripData({...tripData, welcomeAudioText: e.target.value})}
                        placeholder="Welcome to Yosemite! Today we will explore..."
                        className="bg-black/30 border-white/10 rounded-xl h-10 min-h-[40px] focus:min-h-[120px] transition-all py-2 px-3 text-sm"
                      />
                      <div className="flex gap-2 items-center pt-2">
                        {(tripData.introNarrationMaleUrl || tripData.introNarrationFemaleUrl) && (
                          <Button
                            onClick={() => handlePlaySpecificAudio(voicePreference === 'male' ? tripData.introNarrationMaleUrl : tripData.introNarrationFemaleUrl)}
                            className="h-9 w-10 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl border-none flex items-center justify-center p-0 shrink-0"
                          >
                            {playingSpecificAudioUrl === (voicePreference === 'male' ? tripData.introNarrationMaleUrl : tripData.introNarrationFemaleUrl)
                              ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </Button>
                        )}
                        <div className="flex-1">
                          <Button 
                            onClick={handlePublishIntroAudio}
                            disabled={publishingIntroAudio || !tripData.welcomeAudioText}
                            className={cn(
                              "w-full h-9 rounded-xl text-xs font-bold transition-all border-none",
                              tripData.welcomeAudioText 
                                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30" 
                                : "bg-white/10 text-muted-foreground"
                            )}
                          >
                            {publishingIntroAudio ? (
                              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Publishing...</>
                            ) : (
                              <><Volume2 className="w-3.5 h-3.5 mr-2" /> Publish Welcome Audio</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-orange-200/70 font-bold tracking-[0.1em] uppercase flex items-center">
                          <span className="text-orange-400 mr-2 font-black text-xs">Aअ</span> Hindi Welcome
                        </p>
                        <Button
                          onClick={handleTranslateWelcome}
                          disabled={translatingWelcome || !tripData.welcomeAudioText}
                          className="h-6 text-[10px] uppercase font-bold bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-none rounded-lg px-2"
                        >
                          {translatingWelcome ? "Translating..." : "Auto Translate"}
                        </Button>
                      </div>
                      <Textarea 
                        value={tripData.welcomeAudioTextHi || ''}
                        onChange={(e) => setTripData({...tripData, welcomeAudioTextHi: e.target.value})}
                        placeholder="Hindi welcome script will appear here..."
                        className="bg-orange-900/20 border-orange-500/30 rounded-xl h-10 min-h-[40px] focus:min-h-[120px] transition-all py-2 px-3 text-sm focus:border-orange-500"
                      />
                      <div className="flex gap-2 items-center pt-2">
                        {(tripData.introNarrationMaleUrlHi || tripData.introNarrationFemaleUrlHi) && (
                          <Button
                            onClick={() => handlePlaySpecificAudio(voicePreference === 'male-hi' ? tripData.introNarrationMaleUrlHi : tripData.introNarrationFemaleUrlHi)}
                            className="h-9 w-10 bg-orange-600 hover:bg-orange-500 text-white rounded-xl border-none flex items-center justify-center p-0 shrink-0"
                          >
                            {playingSpecificAudioUrl === (voicePreference === 'male-hi' ? tripData.introNarrationMaleUrlHi : tripData.introNarrationFemaleUrlHi)
                              ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </Button>
                        )}
                        <div className="flex-1">
                          <Button 
                            onClick={handlePublishWelcomeHi}
                            disabled={publishingIntroAudio || !tripData.welcomeAudioTextHi}
                            className={cn(
                              "w-full h-9 rounded-xl text-xs font-bold transition-all border-none",
                              tripData.welcomeAudioTextHi 
                                ? "bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/30" 
                                : "bg-white/10 text-muted-foreground"
                            )}
                          >
                            {publishingIntroAudio ? (
                              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Publishing...</>
                            ) : (
                              <><Volume2 className="w-3.5 h-3.5 mr-2" /> Publish Hindi Welcome</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>"""

content = content.replace(ui_search, ui_replace)

with open('src/app/admin/page.tsx', 'w') as f:
    f.write(content)
print("Updated Welcome Audio section for workspaces")
