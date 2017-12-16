//  region Introduction
//  Cloud Function sendToUbidots is triggered when a
//  Sigfox message is sent to the message queue sigfox.devices.all.
//  We call the Ubidots API to send the Sigfox message to Ubidots.

/* eslint-disable max-len, camelcase, no-console, no-nested-ternary, import/no-dynamic-require, import/newline-after-import, import/no-unresolved, global-require, max-len */
//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region AutoInstall: List all dependencies here, or just paste the contents of package.json. AutoInstall will install these dependencies before calling wrap().
const package_json = /* eslint-disable quote-props,quotes,comma-dangle,indent */
//  PASTE PACKAGE.JSON BELOW  //////////////////////////////////////////////////////////
{
  "request": "^2.34.0"
}
//  PASTE PACKAGE.JSON ABOVE  //////////////////////////////////////////////////////////
; /* eslint-enable quote-props,quotes,comma-dangle,indent */

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Declarations: Don't use any require() or process.env in this section because AutoInstall has not loaded our dependencies yet.

//  Location fields to be copied from previous device state into sensor records.
const locationFields = ['lat', 'lng', 'deviceLat', 'deviceLng'];

let apiWrapper = null; // Wrapper for the Ubidots API module.
let initPromise = null;  //  Promise to init the Ubidots API key.
let keys = null;  //  Will store the Ubidots API keys.

//  List of lat/lng fields to be renamed.
let configLat = null;
let configLng = null;
let latFields = null;
let lngFields = null;

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Message Processing Code

function wrap(scloud) {  //  scloud will be either sigfox-gcloud or sigfox-aws, depending on platform.
  //  Wrap the module into a function so that all we defer loading of dependencies,
  //  and ensure that cloud resources are properly disposed. For AWS, wrap() is called after
  //  all dependencies have been loaded.
  let wrapCount = 0; //  Count how many times the wrapper was reused.

  //  All the Ubidots APIs that we support.
  const allAPIs = {  //  Use lazy loading.
    udp: () => require('./lib/socket'),
    tcp: () => require('./lib/socket'),
    rest: () => require('./lib/rest'),
  };
  //  Select the API module to load based on the UBIDOTS_API environment variable.
  const api = process.env.UBIDOTS_API || 'rest';  //  Default to "rest"
  const apiModule = allAPIs[api];
  if (!apiModule) throw new Error(`Unknown UBIDOTS_API: ${api}`);
  apiWrapper = apiModule.wrap(scloud, api);

  function init(req) {
    //  Init the Ubidots API key and lat/lng fields from environment or Google Metadata Store.
    //  Returns a promise.
    if (initPromise) return initPromise;
    let allKeys = null;
    //  Get the function metadata from environment or Google Metadata Store.
    initPromise = scloud.authorizeFunctionMetadata(req)
      .then(authClient => scloud.getFunctionMetadata(req, authClient))
      .then((metadata) => {
        //  Get the API key from environment or Google Metadata Store.
        //  To store two or more keys, separate by comma.
        keys = metadata.UBIDOTS_API_KEY;
        if (!keys || keys.indexOf('YOUR_') === 0) {  //  Halt if we see YOUR_API_KEY.
          throw new Error('UBIDOTS_API_KEY should be defined in environment or Google Cloud Metadata Store');
        }
        allKeys = keys.split(',');  //  Array of Ubidots API keys.

        //  Read the list of lat/lng fields to be renamed.
        configLat = metadata.LAT_FIELDS;
        configLng = metadata.LNG_FIELDS;
        if (configLat && configLng
          && typeof configLat === 'string'
          && typeof configLng === 'string'
          && configLat.trim().length > 0
          && configLng.trim().length > 0
        ) {
          latFields = configLat.trim().split(',').map(s => s.trim());
          lngFields = configLng.trim().split(',').map(s => s.trim());
        }
      })
      //  Init the API.
      .then(() => apiWrapper.init(req, allKeys))
      .catch((error) => {
        initPromise = null;  //  Retry upon error.
        scloud.log(req, 'init', { error });
        throw error;
      });
    return initPromise;
  }

  //  Init the API keys at startup.
  if (!keys) init({});

  function transformBody(req, body0) {
    //  Transform any lat/lng fields in the body to the Ubidots geopoint format.
    //  Rename lat/lng to baseStationLat/baseStationLng. This is the original
    //  truncated lat/lng provided by Sigfox.  If config file contains
    //    lat=latfield1,latfield2,...
    //    lng=lngfield1,lngfield2,...
    //  Then rename latfield1/lngfield1 to lat/lng, latfield2/lngfield2 to lat/lng
    //  whichever occurs first. Ubidots will only render a point on the map
    //  when lat/lng appears in the context. See
    //  https://ubidots.com/docs/api/#send-values-to-one-variable
    const body = Object.assign({}, body0);
    if (body.lat) { body.baseStationLat = body.lat; delete body.lat; }
    if (body.lng) { body.baseStationLng = body.lng; delete body.lng; }
    if (!latFields || !lngFields) return body;

    //  Search for latfield1,lngfield1 then latfield2,lngfield2, ...
    const len = Math.min(latFields.length, lngFields.length);
    for (let i = 0; i < len; i += 1) {
      const latField = latFields[i];
      const lngField = lngFields[i];
      if (latField.length === 0 || lngField.length === 0) continue;
      if (!body[latField] || !body[lngField]) continue;
      //  Found the lat and lng fields.  Copy them to lat/lng and exit.
      body.lat = body[latField];
      body.lng = body[lngField];
      break;
    }
    return body;
  }

  function containsLocation(req, body) {
    //  Return true if body contains location data i.e. deviceLat, deviceLng.
    if (body.deviceLat && body.deviceLng) return true;
    return false;
  }

  function copyLocationSensorFields(req, device, body) {
    //  If body contains location data, copy the previous sensor data. And vice versa.
    //  This is needed because UnaLocation sends lat/lng records separately from sensor records.
    //  Return a promise for the new body.

    //  Get the previous state.
    return (scloud.getDeviceState(req, device)
    //  In case the device state doesn't exist, return empty state and proceed.
      .catch(() => {}))
    //  res contains {"reported":{"tmp":1,"hmd":2,...
      .then((res) => {
        //  state contains {"tmp":1,"hmd":2,...
        const state = (res && res.reported) ? res.reported : {};
        if (Object.keys(state).length === 0) return body;  //  No previous state.
        if (containsLocation(req, body)) {
          //  If body contains location, copy all the past sensor values over.
          const newBody = Object.assign({}, state);
          locationFields.forEach((key) => { //  Exclude metadata
            if (body[key] && key !== 'metadata') newBody[key] = body[key];
          });
          scloud.log(req, 'copyLoc', { status: 'copy_past_sensor', prev: state, now: body, result: newBody });
          return newBody;
        } else if (!containsLocation(req, body)) {
          //  If body does not contain location, copy all past location values over.
          const newBody = Object.assign({}, body);
          locationFields.forEach((key) => {  //  Exclude metadata
            if (state[key] && key !== 'metadata') newBody[key] = state[key];
          });
          scloud.log(req, 'copyLoc', { status: 'copy_past_loc', now: body, prev: state, result: newBody });
          return newBody;
        }
        return body;
      })
      .catch((error) => {  //  Ignore errors.
        scloud.dumpError(error);
        return body;
      });
  }

  function task(req, device, body0, msg) {
    //  The task for this Google Cloud Function: Record the body of the
    //  Sigfox message in Ubidots by calling the Ubidots API.
    //  We match the Sigfox device ID with the datasources already defined
    //  in Ubidots, match the Sigfox message fields with the Ubidots
    //  variables, and populate the values.  All datasources, variables
    //  must be created in advance.  If the device ID exists in multiple
    //  Ubidots accounts, all Ubidots accounts will be updated.
    wrapCount += 1; console.log({ wrapCount }); //  Count how many times the wrapper was reused.
    //  Skip duplicate messages.
    if (body0.duplicate === true || body0.duplicate === 'true') {
      return Promise.resolve(msg);
    }
    Object.assign(req, { device });
    let body = body0;
    let allDevices0 = null;
    //  Init the Ubidots API key and lat/lng fields.
    return apiWrapper.init(req)
    //  If body contains location data, copy the previous sensor data. And vice versa.
      .then(() => copyLocationSensorFields(req, device, body))
      .then((res) => { body = res; })
      //  Transform the lat/lng in the message: deviceLat=>lat, deviceLng=>lng
      .then(() => { body = transformBody(req, body); })
      //  Load the Ubidots datasources if not already loaded.
      .then(() => apiWrapper.loadAllDevices(req))
      .then((res) => { allDevices0 = res; })
      //  Load the Ubidots variables for the device if not loaded already.
      .then(() => apiWrapper.getVariablesByDevice(req, allDevices0, device))
      .then(() => {
        //  Find all Ubidots clients and datasource records for the Sigfox device.
        const devices = allDevices0[device];
        if (!devices || !devices[0]) {
          scloud.log(req, 'missing_ubidots_device', { device, body, msg });
          return null;  //  No such device.
        }
        //  Update the datasource record for each Ubidots client.
        return Promise.all(devices.map((dev) => {
          //  For each Sigfox message field, set the value of the Ubidots variable.
          if (!dev || !dev.variables) return null;
          const vars = dev.variables;
          const allValues = {};  //  All vars to be set.
          for (const key of Object.keys(vars)) {
            if (!body[key]) continue;
            //  value looks like
            //  {"value": "52.1", "timestamp": 1376056359000,
            //    "context": {"lat": 6.1, "lng": -35.1, "status": "driving"}}'
            const value = {
              value: body[key],
              timestamp: parseInt(body.timestamp, 10),  //  Basestation time.
              context: Object.assign({}, body),  //  Entire message.
            };
            if (value.context[key]) delete value.context[key];
            allValues[key] = value;
          }
          //  Set multiple variables with a single Ubidots API call.
          return apiWrapper.setVariables(req, dev, allValues);
        }))
          .catch((error) => { scloud.error(req, 'task', { error, device, body, msg }); throw error; });
      })
      //  Return the message for the next processing step.
      .then(() => msg)
      .catch((error) => { scloud.error(req, 'task', { error, device, body, msg }); throw error; });
  }

  //  Expose these functions outside of the wrapper.  task() is called to execute
  //  the wrapped function when the dependencies and the wrapper have been loaded.
  return { task };
}

//  For unit test only.
exports.wrap = wrap;

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
