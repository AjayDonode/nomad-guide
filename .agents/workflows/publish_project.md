---
description: How to deploy and publish the Next.js application to Firebase App Hosting.
---
# Publish Project Workflow

This workflow deploys your application to Firebase App Hosting.

1. Do not use legacy Firebase Hosting for full-stack apps. We use App Hosting.
2. Ensure you have tested locally and built your project.
3. Run the following command to deploy:
// turbo
```bash
firebase deploy
```

_Note: If deployment fails, check if `firebase.json` contains a valid `apphosting` block with `backendId` and `rootDir`._
