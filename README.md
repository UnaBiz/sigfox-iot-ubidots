**sigfox-iot-ubidots** is a
 [`sigfox-gcloud`](https://www.npmjs.com/package/sigfox-gcloud) and
 [`sigfox-aws`](https://www.npmjs.com/package/sigfox-aws) 
adapter for integrating Sigfox devices with Ubidots.
With `sigfox-gcloud-ubidots` you may **process and render sensor
data** from your Sigfox devices in real time, through the
**Ubidots and AWS IoT platforms.**  You may also configure
Ubidots alerts to notify you via email and SMS based on
the sensor data received.

`sigfox-aws` is an open-source software framework for building a
Sigfox server with AWS IoT.  [Check out `sigfox-aws`](https://www.npmjs.com/package/sigfox-aws)

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.png)

# Installation for AWS

See instructions at:

https://github.com/UnaBiz/sigfox-iot-ubidots/blob/master/aws/index.js

#  Demo    

1. To send messages from a Sigfox device into Ubidots, you may use this Arduino sketch:

    https://github.com/UnaBiz/unabiz-arduino/blob/master/examples/send-light-level/send-light-level.ino
    
    The sketch sends 3 field names and field values, packed into a Structured Message:
        
    ```
    ctr - message counter
    lig - light level, based on the Grove analog light sensor
    tmp - module temperature, based on the Sigfox module's embedded temperature sensor        
    ```

1. In Ubidots, create the **Devices / Datasources** for each Sigfox device to be integrated with Ubidots.
    Name the device / datasource using this format: (change `2C30EB` to your Sigfox device ID)
    
    ```
    Sigfox Device 2C30EB
    ```

   [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device-list.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device-list.png)

1. For each Ubidots device / datasource, create the **Variables** that will be used to transmit
    sensor values from the Sigfox device to Ubidots.  For the above example, you may create 3 variables
    `ctr, lig, tmp` for the Ubidots device `Sigfox Device 2C30EB`.
    
    Run the above Arduino-Sigfox sketch and the sensor values will be automatically recorded by Ubidots under
    `Sigfox Device 2C30EB`.

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device.png)
    
1. Alternatively, you may test by sending a Sigfox message
    from your Sigfox device with the `data` field set to:

    ```
    920e82002731b01db0512201
    ```
   
   We may also use a URL testing tool like Postman to send a POST request to the `sigfoxCallback` URL

   Set the `Content-Type` header to `application/json`. 
   If you're using Postman, click `Body` -> `Raw` -> `JSON (application/json)`
   Set the body to:
   
    ```json
    {
      "device":"1A2345",
      "data":"920e82002731b01db0512201",
      "time":"1476980426",
      "duplicate":"false",
      "snr":"18.86",
      "station":"0000",
      "avgSnr":"15.54",
      "lat":"1",
      "lng":"104",
      "rssi":"-123.00",
      "seqNumber":"1492",
      "ack":"false",
      "longPolling":"false"
    }
    ```
    where `device` is your Sigfox device ID.
    
    Here's the request in Postman:
    
     [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/postman-callback.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/postman-callback.png)
         
1.  The response from the callback function should look like this:
    
    ```json
    {
      "1A2345": {
        "noData": true
      }
    }
    ```
           
1. The test message sent above will be decoded and sent to Ubidots as 

    ```
    ctr (counter): 13
    lig (light level): 760
    tmp (temperature): 29        
    ```

1. For instructions on creating the Ubidots devices and variables, check the **UnaShield Tutorial for Ubidots:**
                                                    
   https://unabiz.github.io/unashield/ubidots    
   
# Sending latitude-longitude values to Ubidots

Some Sigfox devices transmit location data in the form of latitude-longitude
values, such as GPS trackers. Ubidots is capable of rendering such data points
into a map, but under these conditions:

1. The field names must be `lat` and `lng`
1. The fields must appear in the **Context Field** of the variable to be rendered.

Suppose your GPS tracker transmits latitude, longitude as well as temperature.
Then Ubidots expects the `lat` and `lng` fields to be present in the context
whenever the temperature value is transmitted to Ubidots.

The `sendToUbidots` Lambda Function can be configured to send any latitude-longitude fields
as `lat` and `lng`.  Set the environment variables for the `sendToUbidots` Lambda Function as follows:

```
LAT_FIELDS=deviceLat
LNG_FIELDS=deviceLng
```

This configures `sendToUbidots` to look for any data fields named
`deviceLat` and `deviceLng`, and if found, duplicate the fields as `lat` and `lng`

Create variables named `lat` and `lng` for your Sigfox Device in Ubidots.
If your GPS tracker sends the fields `deviceLat` and `deviceLng`,
they will be rendered correctly in a Ubidots map, like below.

Multiple latitude-longitude field names may be specified like this:

```
LAT_FIELDS=deviceLat,geolocLat
LNG_FIELDS=deviceLng,geolocLng
```

In the example above, `sendToUbidots` searches for the fields `deviceLat` and `deviceLng` first.
If the fields are not found, then it searches for `geolocLat` and `geolocLng`.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.png)

# Sending Sigfox Geolocation data to Ubidots

[Sigfox Geolocation](https://www.sigfox.com/en/sigfox-geolocation) is an optional service
provided by your Sigfox Operator that locates your Sigfox device by using
the Sigfox network signal data. The latitude-longitude data provided through
this service may be rendered in Ubidots by setting the **GEOLOC Callback**
as follows:

Log on to the **Sigfox Backend**<br>
https://backend.sigfox.com/

Click **"Device Type"** at the top menu.<br>
Click on your device type.

Click **"Callbacks"** in the left menu.<br>
Click **"New"** at top right.

Enter the callback details as follows:

  -  **Type**: <br>
      **`SERVICE, GEOLOC`**
  
  -  **Channel**: <br>
      **`URL`**
  
  -  **URL Pattern**: <br>
     Enter the `sigfoxCallback` URL from your `sigfox-aws` installation

  -  **Use HTTP Method**: <br>
      **`POST`**
      
  -  **Send SNI**: <br>
      **Checked (Yes)**

  -  **Headers**: <br>
      **(Blank)**

  -  **Content Type**: <br>
      **`application/json`**
          
  - Set the **Body** as:

      ```json
      {
        "time": {time},
        "action": "geoloc",
        "device" : "{device}",       
        "geolocLat": {lat},              
        "geolocLng": {lng},              
        "geolocLocationAccuracy": {radius},
        "seqNumber": {seqNumber},
        "duplicate": "{duplicate}",  
        "snr": "{snr}",              
        "station": "{station}",      
        "avgSnr": "{avgSnr}",     
        "rssi": "{rssi}"               
      }
      ```
      
      Note that the Sigfox Geolocation latitude and longitude fields
      will be transmitted as `geolocLat` and `geolocLng` with the above settings

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-geoloc-detail.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-geoloc-detail.png)

Note that this is a different callback from the **Data Callback** that we
use for normal Sigfox messages.

After saving the callback you should see the Sigfox Geolocation callback
appear under the `SERVICE Callbacks` section, not `DATA Callbacks`.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-geoloc-list.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-geoloc-list.png)

Follow the instructions in the previous section to set the `sendToUbidots` Lambda Function environment variables:

```
NODE_ENV=production
AUTOINSTALL_DEPENDENCY=sigfox-iot-ubidots
UBIDOTS_API_KEY=Your Ubidots API key
LAT_FIELDS=deviceLat,geolocLat
LNG_FIELDS=deviceLng,geolocLng
```

Create variables named `lat`, `lng`, `geolocLat` and `geolocLng` for your Sigfox Device in Ubidots.

To verify that the Sigfox Geolocation data is transmitted correctly, 
click on the variable `geolocLat` for your Sigfox Device.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-geoloc.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-geoloc.png)

You'll see that the `lat` field in the `Context` column shows the same value
as the `geolocLat` field in the left column.  Which means that `sendToUbidots`
has correctly copied the `geolocLat` field into `lat`.

Check the same for `geolocLng` and `lng` fields. 

Now that the `lat` and `lng` fields are properly populated, we will see the
Sigfox Geolocation points on the Ubidots map.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.png)
