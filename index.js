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

//  Assume all Sigfox device IDs are 6 letters/digits long.
const DEVICE_ID_LENGTH = 6;

//  Devices expire in 30 seconds, so they will be auto refreshed from Ubidots.
const expiry = 30 * 1000;

//  Location fields to be copied from previous device state into sensor records.
const locationFields = ['lat', 'lng', 'deviceLat', 'deviceLng'];

let keys = null;  //  Will store the Ubidots API keys.
let allKeys = null;  //  Will store the array of Ubidots API keys.

//  List of lat/lng fields to be renamed.
let configLat = null;
let configLng = null;
let latFields = null;
let lngFields = null;

//  Map Sigfox device ID to an array of Ubidots datasource and variables:
//  allDevices = '2C30EB' => [{
//    client: Ubidots client used to retrieve the datasource,
//    datasource: Datasource for "Sigfox Device 2C30EB",
//    variables: {
//      lig: { variable record for 'lig' }, ...
//    }},
//    //  Repeat the above for other Ubidots clients that have the same device ID.
//  ]
//  datasource should be present after init().
//  variables and details are loaded upon reference to the device.
//  Each entry is an array, one item per Ubidots client / API key.
let allDevicesPromise = null;

//  Cache of devices by Ubidots client.  Each Ubidots client will have one object in this array.
let clientCache = null;

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Message Processing Code

function wrap(scloud) {  //  scloud will be either sigfox-gcloud or sigfox-aws, depending on platform.
  //  Wrap the module into a function so that all we defer loading of dependencies,
  //  and ensure that cloud resources are properly disposed. For AWS, wrap() is called after
  //  all dependencies have been loaded.
  let wrapCount = 0; //  Count how many times the wrapper was reused.
  let initPromise = null;  //  Promise to init the Ubidots API key.

  //  List all require() here because AutoInstall has loaded our dependencies. Don't include sigfox-gcloud or sigfox-aws, they are added by AutoInstall.
  const ubidots = require('./lib/ubidots-node');  //  Ubidots API from github.com/UnaBiz/ubidots-node

  function init(req) {
    //  Init the Ubidots API key and lat/lng fields from environment or Google Metadata Store.
    //  Returns a promise.
    if (initPromise) return initPromise;
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

        //  Cache of devices by Ubidots client.  Each Ubidots client will have one object in this array.
        clientCache = allKeys.map(apiKey => ({
          apiKey,     //  API Key for the Ubidots client.
          expiry: 0,  //  Expiry timestamp for this cache.  Randomised to prevent 2 clients from refreshing at the same time.
          devicesPromise: Promise.resolve({}),  //  Promise for the map of cached devices.
        }));
        return 'OK';
      })
      .catch((error) => {
        initPromise = null;  //  Retry upon error.
        scloud.log(req, 'init', { error });
        throw error;
      });
    return initPromise;
  }

  //  Init the API keys at startup.
  if (!keys) init({});

  function promisfy(func) {
    //  Convert the callback-style function in func and return as a promise.
    return new Promise((resolve, reject) =>
      func((err, res) => (err ? reject(err) : resolve(res))))
      .catch((error) => { throw error; });
  }

  /* allDatasources contains [{
      "id": "5933e6897625426a4f6efd1b",
      "owner": "http://things.ubidots.com/api/v1.6/users/26539",
      "label": "sigfox-device-2c30eb",
      "parent": null,
      "name": "Sigfox Device 2C30EB",
      "url": "http://things.ubidots.com/api/v1.6/datasources/5933e6897625426a4f6efd1b",
      "context": {},
      "tags": [],
      "created_at": "2017-06-04T10:52:57.172",
      "variables_url": "http://things.ubidots.com/api/v1.6/datasources/5933e6897625426a4f6efd1b/variables",
      "number_of_variables": 3,
      "last_activity": null,
      "description": null,
      "position": null}, ...] */

  function processDatasources(req, allDatasources0, client) {
    //  Process all the datasources from Ubidots.  Each datasource (e.g. Sigfox Device 2C30EB)
    //  should correspond to a Sigfox device (e.g. 2C30EB). We index all datasources
    //  by Sigfox device ID for faster lookup.  Assume all devices names end with
    //  the 6-char Sigfox device ID.  Return a map of device IDs to datasource.
    if (!allDatasources0) return {};
    let normalName = '';
    const devices = {};
    for (const ds of allDatasources0) {
      //  Normalise the name to uppercase, hex digits.
      //  "Sigfox Device 2C30EB" => "FDECE2C30EB"
      const name = ds.name.toUpperCase();
      for (let i = 0; i < name.length; i += 1) {
        const ch = name[i];
        if (ch < '0' || ch > 'F' || (ch > '9' && ch < 'A')) continue;
        normalName += ch;
      }
      //  Last 6 chars is the Sigfox ID e.g. '2C30EB'.
      if (normalName.length < DEVICE_ID_LENGTH) {
        scloud.log(req, 'processDatasources', { msg: 'name_too_short', name, device: req.device });
        continue;
      }
      const device = normalName.substring(normalName.length - DEVICE_ID_LENGTH);
      //  Merge the client and datasource into the map of all devices.
      devices[device] = Object.assign({}, devices[device], { client, datasource: ds });
    }
    return devices;
  }

  /* A variable record looks like: {
    "id": "5933e6977625426a5efbaaef",
    "name": "lig",
    "icon": "cloud-upload",
    "unit": null,
    "label": "lig",
    "datasource": {
    "id": "5933e6897625426a4f6efd1b",
      "name": "Sigfox Device 2C30EB",
      "url": "http://things.ubidots.com/api/v1.6/datasources/5933e6897625426a4f6efd1b"
    },
    "url": "http://things.ubidots.com/api/v1.6/variables/5933e6977625426a5efbaaef",
    "description": null,
    "properties": {},
    "tags": [],
    "values_url": "http://things.ubidots.com/api/v1.6/variables/5933e6977625426a5efbaaef/values",
    "created_at": "2017-06-04T10:53:11.037",
    "last_value": {},
    "last_activity": null,
    "type": 0,
    "derived_expr": "" } */

  function getVariablesByDevice(req, allDevices0, device) {
    //  Fetch an array of Ubidots variables for the specified Sigfox device ID.
    //  The array is compiled from all Ubidots clients with the same device ID.
    //  Each array item is a variables map (name => variable record).
    //  Returns a promise.
    const devices = allDevices0[device];
    if (!devices || !devices[0]) {
      return Promise.resolve(null);  //  No such device.
    }
    //  Load the variables from each Ubidots client sequentially, not in parallel.
    const result = [];
    let promises = Promise.resolve('start');
    devices.forEach((dev) => {
      if (dev.variables) {
        result.push(dev.variables);  //  Return cached variables.
        return;
      }
      //  Given the datasource, read the variables from Ubidots.
      const client = dev.client;
      const datasourceId = dev.datasource.id;
      const datasource = client.getDatasource(datasourceId);
      promises = promises
        .then(() => promisfy(datasource.getVariables.bind(datasource)))
        .then((res) => {
          if (!res) return null;  //  No variables.
          return res.results;
        })
        .then((res) => {
          //  Index the variables by name.
          if (!res) return {};  //  No variables.
          const vars = {};
          for (const v of res) {
            const name = v.name;
            vars[name] = v;
          }
          Object.assign(dev, { variables: vars });
          return vars;
        })
        .then((res) => { result.push(res); })
        //  Suppress the error, continue with the next device.
        .catch((error) => { scloud.error(req, 'getVariablesByDevice', { error, device }); return error; });
    });
    return promises.then(() => result);
  }

  function setVariables(req, clientDevice, allValues) {
    //  Set the Ubidots variables for the specified Ubidots device,
    //  for a single Ubidots client only.  allValues looks like:
    //  varname => {"value": "52.1", "timestamp": 1376056359000,
    //    "context": {"lat": 6.1, "lng": -35.1, "status": "driving"}}'
    //  Returns a promise.
    if (!clientDevice) return Promise.resolve(null);  //  No such device.
    //  Resolve each variable name to variable ID.
    const allValuesWithID = [];
    for (const varname of Object.keys(allValues)) {
      const val = allValues[varname];
      const v = clientDevice.variables[varname];
      if (!v) continue;  //  No such variable.
      const varid = v.id;
      allValuesWithID.push(Object.assign({}, val, { variable: varid }));
    }
    //  Call the Ubidots API and update multiple variables.
    //  Note: This setValues API is not exposed in the original Node.js Ubidots library.
    //  Must use the forked version by UnaBiz.
    if (allValuesWithID.length === 0) return Promise.resolve(null);  //  No updates.
    const client = clientDevice.client;
    return new Promise((resolve, reject) =>
      client.setValues(allValuesWithID, (err, res) =>
        (err ? reject(err) : resolve(res))))
      .then(result => scloud.log(req, 'setVariables', { result, allValues, device: req.device }))
      .catch((error) => { scloud.error(req, 'setVariables', { error, allValues, device: req.device }); throw error; });
  }

  function loadDevicesByClient(req, client) {
    //  Preload the Ubidots Devices / Datasources for the Ubidots client.
    //  Returns a promise for the map of devices.

    //  Must bind so that "this" is correct.
    return promisfy(client.auth.bind(client))
    //  Get the list of datasources from Ubidots.
      .then(() => promisfy(client.getDatasources.bind(client)))
      .then((res) => {
        if (!res) throw new Error('no_datasources');
        return res.results;
      })
      //  Convert the datasources to a map of devices.
      .then(res => processDatasources(req, res, client))
      .catch((error) => { scloud.error(req, 'loadDevicesByClient', { error, device: req.device }); throw error; });
  }

  function mergeDevices(req, devicesArray) {
    //  devicesArray contains an array of device maps e.g.
    //    devicesArray[0] = { deviceID1: device1, deviceID2: device2, ... }
    //  Return a map of device IDs to the array of devices with the same ID.
    //    { deviceID1: [ device1, ... ], ... }

    //  Get a list of device IDs, includes duplicates.
    const allDeviceIDs = devicesArray.reduce((merged, devices) =>
      merged.concat(Object.keys(devices)), []);

    //  For each device ID, map it to the list of devices for that ID.
    return allDeviceIDs.reduce((merged, deviceID) => {
      //  If this device ID is duplicate, skip it.
      if (merged[deviceID]) return merged;
      //  For the same device ID, concat the devices from all clients into an array.
      const newMerged = Object.assign({}, merged);
      newMerged[deviceID] = devicesArray.reduce((concat, devices) =>
          devices[deviceID]  //  Concat non-null devices.
            ? concat.concat([devices[deviceID]])
            : concat,
        []);
      return newMerged;
    }, {});
  }

  function loadCache(req, cache) { /*  eslint-disable no-param-reassign  */
    //  Load the cache of devices for the specific Ubidots client if it has expired.
    //  Returns a promise for the map of devices.  Warning: Mutates the cache object.
    if (cache.devicesPromise && cache.expiry >= Date.now()) {
      return cache.devicesPromise;
    }
    //  Randomise the expiry so we don't fetch 2 clients at the same time.
    cache.expiry = Date.now() + Math.floor(Math.random() * expiry);
    const client = ubidots.createClient(cache.apiKey);
    const prevDevices = cache.devicesPromise;
    scloud.log(req, 'loadCache', { device: req.device, apiKey: `${cache.apiKey.substr(0, 10)}...` });
    cache.devicesPromise = loadDevicesByClient(req, client)
      .catch((error) => {
        scloud.error(req, 'loadCache', { error, device: req.device, apiKey: `${cache.apiKey.substr(0, 10)}...` });
        //  In case of error, return the previous result.
        cache.devicesPromise = prevDevices;
        return prevDevices;
      });
    return cache.devicesPromise;
  }  /*  eslint-enable no-param-reassign  */

  function loadAllDevices(req) {
    //  Load the devices for the specified Ubidots API keys,
    //  when multiple Ubidots accounts / API keys are provided.
    //  If already loaded and not expired, return the previously loaded devices.
    //  Returns a promise for the map of device IDs to array of devices for the ID:
    //    { deviceID1: [ device1, ... ], ... }
    //  If any cache has not expired, return the previous results.
    if (allDevicesPromise && !clientCache.find(cache => (cache.expiry <= Date.now()))) {
      return allDevicesPromise;
    }
    //  Else recache each Ubidots client.
    const allDevices = [];
    let promise = Promise.resolve('start');
    for (const cache of clientCache) {
      //  Fetch the devices sequentially, not in parallel, so we don't overload Ubidots.
      promise = promise
        .then(() => loadCache(req, cache))
        .then(devices => allDevices.push(devices));
    }
    //  Load the devices for each Ubidots client.
    allDevicesPromise = promise
    //  Consolidate the array of devices by client and cache it.
      .then(() => mergeDevices(req, allDevices))
      .catch((error) => {
        //  In case of error, don't cache.
        allDevicesPromise = null;
        scloud.error(req, 'loadAllDevices', { error, device: req.device });
        throw error;
      });
    return allDevicesPromise;
  }

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
    return init(req)
      //  If body contains location data, copy the previous sensor data. And vice versa.
      .then(() => copyLocationSensorFields(req, device, body))
      .then((res) => { body = res; })
      //  Transform the lat/lng in the message: deviceLat=>lat, deviceLng=>lng
      .then(() => { body = transformBody(req, body); })
      //  Load the Ubidots datasources if not already loaded.
      .then(() => loadAllDevices(req, allKeys))
      .then((res) => { allDevices0 = res; })
      //  Load the Ubidots variables for the device if not loaded already.
      .then(() => getVariablesByDevice(req, allDevices0, device))
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
          return setVariables(req, dev, allValues);
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
