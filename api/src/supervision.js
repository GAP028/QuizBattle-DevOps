
const fs = require("fs");
const path = require("path");

// Bibliothèque commune de la supervision (monitoring/lib), copiée dans /app/lib
// par le Dockerfile. Hors conteneur (npm run dev), elle est absente : l'API
// fonctionne alors sans /metrics ni pulse.
const DOSSIER = path.join(__dirname, "..", "lib");

if (fs.existsSync(path.join(DOSSIER, "metrics.js"))) {
    // metrics.js et pulse.js sont des modules ESM : require() les charge depuis Node 22.12
    const { exposerMetriques, surveillerDependance } = require(path.join(DOSSIER, "metrics.js"));
    const { demarrerLePulse } = require(path.join(DOSSIER, "pulse.js"));

    module.exports = { active: true, exposerMetriques, surveillerDependance, demarrerLePulse };
} else {
    console.warn("Supervision désactivée : monitoring/lib absent (normal hors Docker)");

    module.exports = {
        active: false,
        exposerMetriques() {},
        surveillerDependance() {},
        demarrerLePulse() {},
    };
}
