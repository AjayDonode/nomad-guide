import re

with open('src/app/admin/page.tsx', 'r') as f:
    content = f.read()

search_str = "            translatingLegId={translatingLegId}"
replace_str = "            translatingLegId={translatingLegId}\n            workspaceLang={workspaceLang}"

content = content.replace(search_str, replace_str)

with open('src/app/admin/page.tsx', 'w') as f:
    f.write(content)
print("Passed workspaceLang to AdminMap")
