"use strict";
//  UDP and TCP Socket API for Ubidots
Object.defineProperty(exports, "__esModule", { value: true });
//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Declarations: Don't use any require() or process.env in this section because AutoInstall has not loaded our dependencies yet.
const dgram_1 = require("dgram");
//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Message Processing Code
function wrap(scloud, api) {
    //  Wrap the module into a function so that all we defer loading of dependencies,
    //  and ensure that cloud resources are properly disposed. For AWS, wrap() is called after
    //  all dependencies have been loaded.
    //  api is the Ubidots API - 'udp' or 'tcp'
    function init(req, allKeys0) {
        //  Init the Ubidots Socket API. Returns a promise.
        return Promise.resolve({ result: 'OK' });
    }
    function loadAllDevices(req) {
        //  Not used. Returns a promise.
        return Promise.resolve([]);
    }
    function getVariablesByDevice(req, allDevices0, device) {
        //  Not used. Returns a promise.
        return Promise.resolve([]);
    }
    function setVariables(req, clientDevice, allValues) {
        //  Set the Ubidots variables for the specified Ubidots device,
        //  for a single Ubidots client only.  allValues looks like:
        //  varname => {"value": "52.1", "timestamp": 1376056359000,
        //    "context": {"lat": 6.1, "lng": -35.1, "status": "driving"}}'
        //  Returns a promise.
        if (!clientDevice)
            return Promise.resolve(null); //  No such device.
        const s = [
            'sigfox-iot-ubidots',
            'POST',
            'A1E-ZvX3cD..ke6Idw',
            '2c30eb=>sw1:4$lat=1.31$lng=103.86,sw2:5',
            'end'
        ].join('|');
        const message = Buffer.from(s);
        const client = dgram_1.default.createSocket('udp4');
        client.send(message, 9012, 'translate.ubidots.com', (err) => {
            client.close();
        });
    }
    //  Expose these functions outside of the wrapper.  task() is called to execute
    //  the wrapped function when the dependencies and the wrapper have been loaded.
    return {
        init,
        loadAllDevices,
        getVariablesByDevice,
        setVariables,
    };
}
exports.wrap = wrap;
//# sourceMappingURL=socket.js.map