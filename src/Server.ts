import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import helmet from 'helmet';
import axios, { AxiosResponse } from 'axios';
import {InfluxDB, Point, HttpError} from '@influxdata/influxdb-client';
import { hostname } from 'os';
import express, { NextFunction, Request, Response } from 'express';
import StatusCodes from 'http-status-codes';
import 'express-async-errors';
import { Router } from 'express';
import logger from '@shared/Logger';

const org = 'bitfolio'
const url = "http://mon-influxdb.monitoring:8086"
const host = 'mon-influxdb.monitoring'
const port = 8086
// const url = "http://localhost:8086"
// const host = 'localhost'
const index: Router = Router();
index.get('/', (req, res, next) => {
   res.send('{"status":"UP","checks":"none"}'); 
});
// Tron network stats
const tronUrl = 'https://apilist.tronscan.org/api/stats/overview'

console.log('Starting tronscan stats overview. Collecting previous day stats every 8 hours.')

function writeToInflux(writeApi: any, d0: any) {
  var d = new Date(d0.date)
  var month = d.toLocaleString("en-US", {month: "numeric"})
  var day = d.toLocaleString("en-US", {day: "numeric"})
  var year = d.toLocaleString("en-US", {year: "numeric"})
  var myDate = month + "/" + day + "/" + year
  console.log('Writting tron stats data for ' + myDate + ' to influxDB.')
  const point0 = new Point('tron')
    .tag('network', 'tron')
    .tag('dateString', myDate)
    .intField('date', d0.date)
    .stringField('dateString', myDate)
    .intField('accountWithTrx', d0.accountWithTrx)
    .intField('totalTransaction', d0.totalTransaction)
    .intField('avgBlockTime', d0.avgBlockTime)
    .intField('avgBlockSize', d0.avgBlockSize)
    .intField('totalBlockCount', d0.totalBlockCount)
    .intField('newAddressSeen', d0.newAddressSeen)
    .intField('active_account_number', d0.active_account_number)
    .intField('blockchainSize', d0.blockchainSize)
    .intField('totalAddress', d0.totalAddress)
    .intField('newBlockSeen', d0.newBlockSeen)
    .intField('newTransactionSeen', d0.newTransactionSeen)
    .intField('newTrigger', d0.newTrigger)
    .intField('newTrc10', d0.newTrc10)
    .intField('newTrc20', d0.newTrc20)
    .intField('totalTrc10', d0.totalTrc10)
    .intField('totalTrc20', d0.totalTrc20)
    .intField('triggers', d0.triggers)
    .intField('trx_transfer', d0.trx_transfer)
    .intField('trc10_transfer', d0.trc10_transfer)
    .intField('freeze_transaction', d0.freeze_transaction)
    .intField('vote_transaction', d0.vote_transaction)
    .intField('shielded_transaction', d0.shielded_transaction)
    .intField('other_transaction', d0.other_transaction)
    .intField('energy_usage', d0.energy_usage)
    .intField('net_usage', d0.net_usage)
  writeApi.writePoint(point0)
}

setInterval(() => {
  axios.get(tronUrl)
    .then((response: AxiosResponse) => {
      const writeApi = new InfluxDB({ url }).getWriteApi(org, 'networks', 's')
      writeApi.useDefaultTags({location: hostname()})
      // Write only the last data point
      var indexLength = response.data.data.length
      var lastIndex = indexLength - 1
      console.log('tronscan stats overview returned an indexLength of: ' + indexLength )
      writeToInflux(writeApi, response.data.data[lastIndex])
      //for (let i = 0; i < response.data.data.length; i++) {
      //  writeToInflux(writeApi, response.data.data[i])
      //}
      writeApi.close()
    })
}, 28800000) //28800000 miliseconds is 8 hours (or 480 minutes or 28800 seconds)
// every 10 seconds: 10000

const app = express();
const { BAD_REQUEST } = StatusCodes;

const health = require('@cloudnative/health-connect');
let healthCheck = new health.HealthChecker();

// The livecheck below does not do anything
// Just use the readycheck, which checks the influxdb upstream service.
const livePromise = () => new Promise((resolve, _reject) => {
  const appFunctioning = true;
  // You should change the above to a task to determine if your app is functioning correctly
  if (appFunctioning) {
    resolve('');
  } else {
    _reject(new Error("App is not functioning correctly"));
  }
});

// https://github.com/CloudNativeJS/cloud-health/blob/master/src/healthcheck/checks/PingCheck.ts
// Arguments: host: string, path = '', port = '80', method = 'HEAD' 
let readyCheck = new health.PingCheck(host, '', port);
healthCheck.registerReadinessCheck(readyCheck);

// let liveCheck = new health.LivenessCheck("LivenessCheck", livePromise);
// Using readyCheck, not liveCheck
healthCheck.registerLivenessCheck(readyCheck);

/************************************************************************************
 *                              Set basic express settings
 ***********************************************************************************/

app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(cookieParser());

// Show routes called in console during development
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Security
if (process.env.NODE_ENV === 'production') {
    app.use(helmet());
}

app.use('/live', health.LivenessEndpoint(healthCheck));
app.use('/ready', health.ReadinessEndpoint(healthCheck));
app.use('/healthy', health.HealthEndpoint(healthCheck));

// Add APIs
app.use('/', index);

// Print API errors
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.err(err, true);
    return res.status(BAD_REQUEST).json({
        error: err.message,
    });
});



/************************************************************************************
 *                              Serve front-end content
 ***********************************************************************************/

const viewsDir = path.join(__dirname, 'views');
app.set('views', viewsDir);
const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir));
app.get('*', (req: Request, res: Response) => {
    res.sendFile('index.html', {root: viewsDir});
});

// Export express instance
export default app;
