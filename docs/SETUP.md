All methods below require you to install the CLI tool before proceeding.

Install it by running `npm i @tuyapi/cli -g`. If it returns an error, you may need to prefix the command with `sudo`. (Tip: using `sudo` to install global packages is not considered best practice. See [this NPM article](https://docs.npmjs.com/getting-started/fixing-npm-permissions) for some help.)

## Listing Tuya devices from the **Tuya Smart** or **Smart Life** apps (highly recommended)

This method is fast and easy. If you're having trouble manually linking your device with the below method, we recommend you try this. All devices that you want to use **must** be registered in either the Tuya Smart app or the Smart Life app.

1. Follow steps 1 through 4 from the "Linking a Tuya device with Smart Link" method below.
2. Go to Cloud -> Project and click the project you created earlier. Then click "Link Device". Click the "Link Devices by App Account" tab.
3. Click "Add App Account" and scan the QR code from your smart phone/tablet app by going to the 'Me' tab in the app, and tapping a QR code / Scan button in the upper right. Your account will now be linked.
4. On the command line, run `tuya-cli wizard`. It will prompt you for required information, and will then list out all your device names, IDs, and keys for use with TuyAPI. Copy and save this information to a safe place for later reference.

## Linking a Tuya device with Smart Link

This method requires you to create a developer account on [iot.tuya.com](https://iot.tuya.com). It doesn't matter if the device(s) are currently registered in the Tuya Smart app or Smart Life app or not.

1. Create a new account on [iot.tuya.com](https://iot.tuya.com) and make sure you are logged in. Go to Cloud -> Project in the left nav drawer and click "Create". After you've created a new project, click into it. The access ID and access key are equivalent to the API key and API secret values need in step 6.
2. Go to App -> App SDK -> Develpment in the nav drawer. Click "Create" and enter whatever you want for the package names and channel ID (for the Android package name, you must enter a string beginning with `com.`). Take note of the **Channel ID** you entered. This is equivalent to the `schema` value needed in step 6. Ignore any app key and app secret values you see in this section as they are not used.
3. Go to Cloud -> Project and click the project you created earlier. Then click "Link Device". Click the "Link devices by Apps" tab, and click "Add Apps". Check the app you just created and click "Ok".
4. On the same page, click "API Group" on the left side. Change the status to **Open** for the following three API Groups by clicking "Apply" for each line, entering any reason, and clicking "OK": "Authorization Management", "Device Management", "Device Control", "User Management", "Network Management", "Data Service", "Home Management", "Device User Mangement" and "Device Statistics". It can take 10-15 minutes for these changes to take effect. 
5. Put your devices into linking mode.  This process is specific to each type of device, find instructions in the Tuya Smart app. Usually this consists of turning it on and off several times or holding down a button.
6. On the command line, run `tuya-cli link --api-key <your api key> --api-secret <your api secret> --schema <your schema/Channel ID> --ssid <your WiFi name> --password <your WiFi password> --region us`.  For the region parameter, choose the two-letter country code from `us`, `eu`, and `cn` that is geographically closest to you.
7. Your devices should link in under a minute and the parameters required to control them will be printed out to the console. If you experience problems, first make sure any smart phone/tablet app that you use with your devices is completely closed and not attempting to communicate with any of the devices.

### Troubleshooting

**`Error: sign invalid`**

This means that one of the parameters you're passing in (`api-key`, `api-secret`, `schema`) is incorrect. Double check the values.

**`Device(s) failed to be registered! Error: Timed out waiting for devices to connect.`**

This can happen for a number of reasons. It means that the device never authenticated against Tuya's API (although it *does not* necessarily mean that the device could not connect to WiFi). Try the following:
- Making sure that your computer is connected to your network via WiFi **only** (unplug ethernet if necessary)
- Making sure that your network is 2.4 Ghz (devices will also connect if you have both 2.4 Ghz and 5 Ghz bands under the same SSID)
- Using a different OS
- Removing special characters from your network's SSID

## **DEPRECATED** - Linking a Tuya Device with MITM

This method is deprecated because Tuya-branded apps have started to encrypt their traffic in an effort to prevent MITM attacks like this one.  If this method doesn't work, try the above.

1. Add any devices you want to use with `tuyapi` to the Tuya Smart app.
2. Install AnyProxy by running `npm i anyproxy -g`.  Then run `anyproxy-ca`.
3. Run `tuya-cli list-app`.  It will print out a QR code; scan it with your phone and install the root certificate.  After installation, [trust the installed root certificate](https://support.apple.com/en-nz/HT204477).
4. [Configure the proxy](http://www.iphonehacks.com/2017/02/how-to-configure-use-proxy-iphone-ipad.html) on your phone with the parameters provided in the console.
5. Enable full trust of certificate by going to Settings > General > About > Certificate Trust Settings
6. Open Tuya Smart and refresh the list of devices by "pulling down".
7. A list of ID and key pairs should appear in the console.
8. It's recommended to untrust the root certificate after you're done for security purposes.
