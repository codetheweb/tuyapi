## Linking a Tuya Device

1. First, acquire API credentials by following [this guide](https://tuyaapi.github.io/cloud/apikeys/). The process should just take a few minutes.

2. Next, install the CLI tool by running `npm i @tuyapi/cli -g`. If it returns an error, you may need to prefix the command with `sudo`. (Tip: using `sudo` to install global packages is not considered best practice. See [this NPM article](https://docs.npmjs.com/getting-started/fixing-npm-permissions) for some help.)

3. Run `tuya-cli link-wizard`. It will walk you through the process of linking your device(s). When it's finished, copy the resulting device(s) `id` and `localKey`.
