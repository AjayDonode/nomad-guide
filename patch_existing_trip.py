import re

with open('src/app/admin/page.tsx', 'r') as f:
    content = f.read()

search_str = """        introNarrationMaleUrl: existingTrip.introNarrationMaleUrl || null,
        introNarrationFemaleUrl: existingTrip.introNarrationFemaleUrl || null,
        welcomeAudioText: existingTrip.welcomeAudioText || "",
        coverImage: existingTrip.coverImage || null,
      })"""
replace_str = """        introNarrationMaleUrl: existingTrip.introNarrationMaleUrl || null,
        introNarrationFemaleUrl: existingTrip.introNarrationFemaleUrl || null,
        welcomeAudioText: existingTrip.welcomeAudioText || "",
        welcomeAudioTextHi: existingTrip.welcomeAudioTextHi || "",
        introNarrationMaleUrlHi: existingTrip.introNarrationMaleUrlHi || null,
        introNarrationFemaleUrlHi: existingTrip.introNarrationFemaleUrlHi || null,
        coverImage: existingTrip.coverImage || null,
      })"""

content = content.replace(search_str, replace_str)

with open('src/app/admin/page.tsx', 'w') as f:
    f.write(content)
print("Updated existingTrip state mapping")
