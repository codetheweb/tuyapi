## Linking a Tuya Device

**Note**: Unfortunantly, the below method doesn't work with Android phones.  Please see [this guide](https://github.com/codetheweb/tuyapi/blob/master/docs/SETUP_DEPRECATED.md#android) if you don't have access to an iPhone.

1. Add any devices you want to use with `tuyapi` to the Tuya Smart app.

2. Install the CLI tool by running `npm i @tuyapi/cli -g`. If it returns an error, you may need to prefix the command with `sudo`. (Tip: using `sudo` to install global packages is not considered best practice. See [this NPM article](https://docs.npmjs.com/getting-started/fixing-npm-permissions) for some help.)

3. Run `tuya-cli list-app`.  It will print out a QR code; scan it with your phone and install the root certificate.  After installation, [trust the installed root certificate](https://support.apple.com/en-nz/HT204477).

4. [Configure the proxy](http://www.iphonehacks.com/2017/02/how-to-configure-use-proxy-iphone-ipad.html) on your phone with the parameters provided in the console.

4. Open Tuya Smart and refresh the list of devices by "pulling down".

5. A list of ID and key pairs should appear in the console.

6. It's recommended to untrust the root certificate after you're done for security purposes.
