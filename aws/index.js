//  sendToUbidots Installation Instructions:
//  Copy and paste the entire contents of this file into a Lambda Function
//  Name: sendToUbidots
//  Runtime: Node.js 6.10
//  Memory: 512 MB
//  Timeout: 5 min
//  Existing Role: lambda_iot Role, which has the LambdaExecuteIoTUpdate Policy
//    (defined in ../policy/LambdaExecuteIoTUpdate.json)
//  Debugging: Enable active tracing
//  Environment Variables:
//    NODE_ENV=production
//    AUTOINSTALL_DEPENDENCY=sigfox-iot-ubidots
//    UBIDOTS_API_KEY=Your Ubidots API key
//    LAT_FIELDS=deviceLat,geolocLat
//    LNG_FIELDS=deviceLng,geolocLng

//  Go to AWS IoT, create a Rule:
//  Name: sigfoxSendToUbidots
//  SQL Version: Beta
//  Attribute: *
//  Topic filter: sigfox/types/sendToUbidots
//  Condition: (Blank)
//  Action: Run Lambda Function sendToUbidots
