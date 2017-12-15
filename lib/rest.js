"use strict";
//  REST API for Ubidots
Object.defineProperty(exports, "__esModule", { value: true });
//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Declarations: Don't use any require() or process.env in this section because AutoInstall has not loaded our dependencies yet.
//  Assume all Sigfox device IDs are 6 letters/digits long.
const DEVICE_ID_LENGTH = 6;
//  Devices expire in 30 seconds, so they will be auto refreshed from Ubidots.
const expiry = 30 * 1000;
let allKeys = null; //  Will store the array of Ubidots API keys.
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
// const ubidots = require('./ubidots-node'); //  Ubidots API from github.com/UnaBiz/ubidots-node
const ubidots_node_1 = require("./ubidots-node"); //  Ubidots API from github.com/UnaBiz/ubidots-node
//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Message Processing Code
function wrap(scloud, api) {
    //  Wrap the module into a function so that all we defer loading of dependencies,
    //  and ensure that cloud resources are properly disposed. For AWS, wrap() is called after
    //  all dependencies have been loaded.
    function init(req, allKeys0) {
        //  Init the Ubidots REST API. Returns a promise.
        //  Cache of devices by Ubidots client.  Each Ubidots client will have one object in this array.
        allKeys = allKeys0;
        clientCache = allKeys.map(apiKey => ({
            apiKey,
            expiry: 0,
            devicesPromise: Promise.resolve({}),
        }));
        return Promise.resolve({ result: 'OK' });
    }
    function promisfy(func) {
        //  Convert the callback-style function in func and return as a promise.
        return new Promise((resolve, reject) => func((err, res) => (err ? reject(err) : resolve(res))))
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
        if (!allDatasources0)
            return {};
        let normalName = '';
        const devices = {};
        for (const ds of allDatasources0) {
            //  Normalise the name to uppercase, hex digits.
            //  "Sigfox Device 2C30EB" => "FDECE2C30EB"
            const name = ds.name.toUpperCase();
            for (let i = 0; i < name.length; i += 1) {
                const ch = name[i];
                if (ch < '0' || ch > 'F' || (ch > '9' && ch < 'A'))
                    continue;
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
            return Promise.resolve(null); //  No such device.
        }
        //  Load the variables from each Ubidots client sequentially, not in parallel.
        const result = [];
        let promises = Promise.resolve('start');
        devices.forEach((dev) => {
            if (dev.variables) {
                result.push(dev.variables); //  Return cached variables.
                return;
            }
            //  Given the datasource, read the variables from Ubidots.
            const client = dev.client;
            const datasourceId = dev.datasource.id;
            const datasource = client.getDatasource(datasourceId);
            promises = promises
                .then(() => promisfy(datasource.getVariables.bind(datasource)))
                .then((res) => {
                if (!res)
                    return null; //  No variables.
                return res.results;
            })
                .then((res) => {
                //  Index the variables by name.
                if (!res)
                    return {}; //  No variables.
                const vars = {};
                for (const v of res) {
                    const name = v.name;
                    vars[name] = v;
                }
                Object.assign(dev, { variables: vars });
                return vars;
            })
                .then((res) => { result.push(res); })
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
        if (!clientDevice)
            return Promise.resolve(null); //  No such device.
        //  Resolve each variable name to variable ID.
        const allValuesWithID = [];
        for (const varname of Object.keys(allValues)) {
            const val = allValues[varname];
            const v = clientDevice.variables[varname];
            if (!v)
                continue; //  No such variable.
            const varid = v.id;
            allValuesWithID.push(Object.assign({}, val, { variable: varid }));
        }
        //  Call the Ubidots API and update multiple variables.
        //  Note: This setValues API is not exposed in the original Node.js Ubidots library.
        //  Must use the forked version by UnaBiz.
        if (allValuesWithID.length === 0)
            return Promise.resolve(null); //  No updates.
        const client = clientDevice.client;
        return new Promise((resolve, reject) => client.setValues(allValuesWithID, (err, res) => (err ? reject(err) : resolve(res))))
            .then(result => scloud.log(req, 'setVariables', { result, allValues, device: req.device }))
            .catch((error) => { scloud.error(req, 'setVariables', { error, allValues, device: req.device }); throw error; });
    }
    function loadDevicesByClient(req, client) {
        //  Preload the Ubidots Devices / Datasources for the Ubidots client.
        //  Returns a promise for the map of devices.
        //  Must bind so that "this" is correct.
        return promisfy(client.auth.bind(client))
            .then(() => promisfy(client.getDatasources.bind(client)))
            .then((res) => {
            if (!res)
                throw new Error('no_datasources');
            return res.results;
        })
            .then(res => processDatasources(req, res, client))
            .catch((error) => { scloud.error(req, 'loadDevicesByClient', { error, device: req.device }); throw error; });
    }
    function mergeDevices(req, devicesArray) {
        //  devicesArray contains an array of device maps e.g.
        //    devicesArray[0] = { deviceID1: device1, deviceID2: device2, ... }
        //  Return a map of device IDs to the array of devices with the same ID.
        //    { deviceID1: [ device1, ... ], ... }
        //  Get a list of device IDs, includes duplicates.
        const allDeviceIDs = devicesArray.reduce((merged, devices) => merged.concat(Object.keys(devices)), []);
        //  For each device ID, map it to the list of devices for that ID.
        return allDeviceIDs.reduce((merged, deviceID) => {
            //  If this device ID is duplicate, skip it.
            if (merged[deviceID])
                return merged;
            //  For the same device ID, concat the devices from all clients into an array.
            const newMerged = Object.assign({}, merged);
            newMerged[deviceID] = devicesArray.reduce((concat, devices) => devices[deviceID] //  Concat non-null devices.
                ? concat.concat([devices[deviceID]])
                : concat, []);
            return newMerged;
        }, {});
    }
    function loadCache(req, cache) {
        //  Load the cache of devices for the specific Ubidots client if it has expired.
        //  Returns a promise for the map of devices.  Warning: Mutates the cache object.
        if (cache.devicesPromise && cache.expiry >= Date.now()) {
            return cache.devicesPromise;
        }
        //  Randomise the expiry so we don't fetch 2 clients at the same time.
        cache.expiry = Date.now() + Math.floor(Math.random() * expiry);
        const client = ubidots_node_1.default.createClient(cache.apiKey);
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
    } /*  eslint-enable no-param-reassign  */
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
                .then(devices => allDevices.push(devices) && Promise.resolve('OK'));
        }
        //  Load the devices for each Ubidots client.
        allDevicesPromise = promise
            .then(() => mergeDevices(req, allDevices))
            .catch((error) => {
            //  In case of error, don't cache.
            allDevicesPromise = null;
            scloud.error(req, 'loadAllDevices', { error, device: req.device });
            throw error;
        });
        return allDevicesPromise;
    }
    //  Expose these functions outside of the wrapper.
    return {
        init,
        loadAllDevices,
        getVariablesByDevice,
        setVariables,
    };
}
exports.wrap = wrap;
//# sourceMappingURL=rest.js.map