Setup
=========

## macOS

1. Download [Charles](https://www.charlesproxy.com).
2. Turn off the local proxy for your computer:

![proxy toggle](images/proxy-toggle.png)

3. And turn off recording for now (with the red button), so it's easier to find the correct data later on:

![record toggle](images/record-toggle.png)

4. Setup Charles' [SSL certificate](https://www.charlesproxy.com/documentation/using-charles/ssl-certificates/) for your phone.
5. Proxy your phone's traffic through Charles (IP is the IP of your computer):

![proxy config](images/proxy-config.png)

6. Launch the app that came with your device. If you've already added the device you want to configure to the app, remove it now.
7. Add your device. Before tapping "Continue" after entering your network's password, pause and turn back on traffic recording in Charles.

![wifi config](images/wifi-config.png)

8. When the device is added in the app, turn off traffic recording in Charles.
9. Find the HTTPS request where `a=s.m.dev.list`:

![device data](images/device-data.png)

10. Find the parameters needed for constructing a TuyAPI instance from the contents of the response:

    {
      id: uuid,
      uid: productId,
      key: localKey
    }
