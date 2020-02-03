Both methods below require you to install the CLI tool before proceeding.

Install it by running `npm i @tuyapi/cli -g`. If it returns an error, you may need to prefix the command with `sudo`. (Tip: using `sudo` to install global packages is not considered best practice. See [this NPM article](https://docs.npmjs.com/getting-started/fixing-npm-permissions) for some help.)

## Linking a Tuya device with Smart Link

This method requires you to create a developer account on [iot.tuya.com](https://iot.tuya.com).

1. After you've created a new account, hover over the user icon in the top right and select "Cloud API Authorization".  Apply for authorization, it may take a few days for your account to be approved.  (The access ID and access key are equivalent to the API key and API secret values need.)
2. Go to App Service > App SDK.  Click on "Obtain SDK", select the WiFi option, and enter whatever you want for the package names and channel ID (for the Android package name, you must enter a string begining with `com.`).
3. Take note of the **Channel ID** after saving.  This is equivalent to the `schema` value needed.
4. Put your devices into linking mode.  This process is specific to each type of device, find instructions in the Tuya Smart app. Usually this consists of turning it on and off several times or holding down a button.
5. On the command line, run something similar to `tuya-cli link --api-key <your api key> --api-secret <your api secret> --schema <your-schema/channel ID> --ssid <your WiFi name> --password <your WiFi password>`.
6. Your devices should link in under a minute and the parameters required to control them will be printed out to the console.


## Linking a Tuya Device with MITM (deprecated)

This method is deprecated because Tuya-branded apps have started to encrypt their traffic in an effort to prevent MITM attacks like this one.  If this method doesn't work, try the above.

1. Add any devices you want to use with `tuyapi` to the Tuya Smart app.
2. Install AnyProxy by running `npm i anyproxy -g`.  Then run `anyproxy-ca`.
3. Run `tuya-cli list-app`.  It will print out a QR code; scan it with your phone and install the root certificate.  After installation, [trust the installed root certificate](https://support.apple.com/en-nz/HT204477).
4. [Configure the proxy](http://www.iphonehacks.com/2017/02/how-to-configure-use-proxy-iphone-ipad.html) on your phone with the parameters provided in the console.
5. Enable full trust of certificate by going to Settings > General > About > Certificate Trust Settings
6. Open Tuya Smart and refresh the list of devices by "pulling down".
7. A list of ID and key pairs should appear in the console.
8. It's recommended to untrust the root certificate after you're done for security purposes.
