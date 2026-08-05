// Schema sync used to run here on every process boot via `prisma db push`,
// duplicating render.yaml's preDeployCommand (which now runs
// `prisma migrate deploy` instead - reviewed, versioned migrations, not an
// unreviewed schema push straight to production on every deploy AND every
// restart). Running it twice was pure risk with no benefit once the
// pre-deploy step already syncs the schema before this process even starts.

await import("../server.js");
