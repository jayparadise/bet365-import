# bet365 → DST Data Entry import

Static page + Vercel functions. No build step.

Deploy: `vercel deploy --prod` from this folder (or drag the folder into a new Vercel project).

Storage: create a **Blob** store (private) in the Vercel dashboard (Storage → Create → Blob) and connect it to this project — that injects `BLOB_READ_WRITE_TOKEN`. Aliases and the import log live there as small JSON files. No other env vars needed.

Traders log in with their data-entry username/password; the token is kept in an httpOnly cookie and every save is attributed to them.
