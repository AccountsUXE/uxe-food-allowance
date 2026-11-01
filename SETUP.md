# Deploy — 2 steps

## 1) Put this code in a GitHub repo (no coding)
- Go to github.com → New repository → name it `uxe-food-allowance` → Create.
- On the empty repo page click **uploading an existing file**.
- Drag in ALL files from this folder (server.js, package.json, render.yaml,
  and the `public` folder with index.html) → Commit.

## 2) Send Claude the repo link
Paste the repo URL (e.g. https://github.com/AccountsUXE/uxe-food-allowance)
back in the chat. Claude will create the database + web service on Render,
set the access code, and give you the live https://...onrender.com link.

(Advanced: on Render you can instead do New → Blueprint and pick the repo;
render.yaml provisions everything. You just set ACCESS_CODE.)
