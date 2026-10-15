// Signature ad-hoc de l'app après packaging (pas de certificat Apple Developer).
// Sans elle, electron-builder laisse la signature d'Electron invalidée (binaire renommé,
// Info.plist modifié) et macOS affiche « SimpleClient est endommagé » au téléchargement.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
