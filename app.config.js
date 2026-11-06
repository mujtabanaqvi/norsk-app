const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const localGoogleServices = path.resolve(__dirname, 'google-services.json');
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ??
    (fs.existsSync(localGoogleServices) ? './google-services.json' : undefined);

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};

