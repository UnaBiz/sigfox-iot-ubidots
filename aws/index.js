//  sendToUbidots Installation Instructions:
//  Copy and paste the entire contents of this file into a Lambda Function
//  Name: sendToUbidots
//  Runtime: Node.js 6.10
//  Handler: index.main
//  Memory: 512 MB
//  Timeout: 5 min
//  Existing Role: lambda_iot Role, which has the LambdaExecuteIoTUpdate Policy
//    (defined in https://github.com/UnaBiz/sigfox-aws/blob/master/policy/LambdaExecuteIoTUpdate.json)
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
//  Action: Invoke Lambda Function sendToUbidots

//  Refer to this URL for source code and comments:
//  https://github.com/UnaBiz/sigfox-iot-ubidots/blob/master/index.js

//  We set the wrap function and package_json to null indicate that AutoInstall
//  should install the dependency from environment variable AUTOINSTALL_DEPENDENCY (see above).
const wrap = null; // eslint-disable-next-line camelcase
const package_json = null;

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Standard Code for AutoInstall Startup Function 1.0.  Do not modify.  https://github.com/UnaBiz/sigfox-iot-cloud/blob/master/autoinstall.js
/*  eslint-disable camelcase,no-unused-vars,import/no-absolute-path,import/no-unresolved,no-use-before-define,global-require,max-len,no-tabs,brace-style,import/no-extraneous-dependencies */
const wrapper = {};  //  The single reused wrapper instance (initially empty) for invoking the module functions.
exports.main = process.env.FUNCTION_NAME ? require('sigfox-gcloud/main').getMainFunction(wrapper, wrap, package_json)  //  Google Cloud.
  : (event, context, callback) => {
    const afterExec = error => error ? callback(error, 'AutoInstall Failed')
      : require('/tmp/autoinstall').installAndRunWrapper(event, context, callback, package_json, __filename, wrapper, wrap);
    if (require('fs').existsSync('/tmp/autoinstall.js')) return afterExec(null);  //  Already downloaded.
    const cmd = 'curl -s -S -o /tmp/autoinstall.js https://raw.githubusercontent.com/UnaBiz/sigfox-iot-cloud/master/autoinstall.js';
    const child = require('child_process').exec(cmd, { maxBuffer: 1024 * 500 }, afterExec);
    child.stdout.on('data', console.log); child.stderr.on('data', console.error); return null; };
//  exports.main is the startup function for AWS Lambda and Google Cloud Function.
//  When AWS starts our Lambda function, we load the autoinstall script from GitHub to install any NPM dependencies.
//  For first run, install the dependencies specified in package_json and proceed to next step.
//  For future runs, just execute the wrapper function with the event, context, callback parameters.
//  //////////////////////////////////////////////////////////////////////////////////// endregion
