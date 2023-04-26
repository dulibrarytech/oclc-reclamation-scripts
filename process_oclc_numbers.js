/**

 Copyright 2023 University of Denver

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 */

'use strict';

require('dotenv').config();
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

const {ClientCredentials} = require('simple-oauth2');
const HTTP = require('axios');
const TOKEN_HOST_URL = process.env.WORLDCAT_AUTHORIZATION_SERVER_TOKEN_URL;
const TOKEN_PATH = process.env.WORLDCAT_TOKEN_PATH;
const AUTH_SCOPE = process.env.WORLDCAT_AUTH_SCOPE;
const HOLDINGS_API_ENDPOINT = process.env.WORLDCAT_HOLDINGS_API_ENDPOINT;
const CLIENT_ID = process.env.WORLDCAT_METADATA_API_KEY;
const CLIENT_SECRET = process.env.WORLDCAT_METADATA_API_SECRET;
const INSTITUTION_SYMBOL = process.env.WORLDCAT_INSTITUTION_SYMBOL;
const REQUEST_TIMER = 350;
const CONFIG = {
    client: {
        id: CLIENT_ID,
        secret: CLIENT_SECRET
    },
    auth: {
        tokenHost: TOKEN_HOST_URL,
        tokenPath: TOKEN_PATH
    }
};

const DB = require('knex')({
    client: 'mysql2',
    connection: {
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABSE
    },
    pool: {min: 0, max: 250},
    acquireConnectionTimeout: 1200000
});

/**
 * Gets access token from WorldCat API
 */
async function get_access_token() {
    const CLIENT = new ClientCredentials(CONFIG);
    const TOKEN = await CLIENT.getToken({json: true, scope: AUTH_SCOPE});
    return TOKEN.token.access_token;
}

/**
 * Gets processed records
 * @return {Promise<void>}
 */
async function get_records() {

    try {

        let access_token = await get_access_token();
        let timer = setInterval(function () {

            DB('records')
            .select('id', 'oclc_numbers')
            .where({
                is_complete: 0,
                is_locked: 0
            })
            .limit(1)
            .then((data) => {

                if (data.length === 0) {
                    clearInterval(timer);
                    console.log('Process complete.');
                    return false;
                }

                if (data[0].oclc_numbers === null ) {

                    let where_obj = {};
                    let record = {};
                    where_obj.id = data[0].id;
                    record.is_complete = 1;
                    record.is_worldcat_record_found = 0;
                    update(where_obj, record);
                    return false;
                }

                console.log('id: ', data[0].id);

                let oclc_numbers = data[0].oclc_numbers.split(',');

                if (oclc_numbers.length > 1) {

                    let timer = setInterval(function () {

                        let oclc_number = oclc_numbers.pop();

                        if (oclc_numbers.length === 0) {
                            clearInterval(timer);
                            return false;
                        }

                        oclc_number = oclc_number.replace('on', '');
                        oclc_number = oclc_number.replace('ocn', '');
                        oclc_number = oclc_number.replace('(Readex)', '');
                        oclc_number = oclc_number.replace('(OCoLCvv)', '');
                        oclc_number = oclc_number.replace('DU', '');
                        oclc_number = oclc_number.replace('AAC', '');
                        request(access_token, INSTITUTION_SYMBOL, data[0].id, oclc_number);

                    }, 1000);

                } else if (oclc_numbers.length === 1) {
                    data[0].oclc_numbers = data[0].oclc_numbers.replace('on', '');
                    data[0].oclc_numbers = data[0].oclc_numbers.replace('ocn', '');
                    data[0].oclc_numbers = data[0].oclc_numbers.replace('(Readex)', '');
                    data[0].oclc_numbers = data[0].oclc_numbers.replace('(OCoLCvv)', '');
                    data[0].oclc_numbers = data[0].oclc_numbers.replace('DU', '');
                    data[0].oclc_numbers = data[0].oclc_numbers.replace('AAC', '');
                    request(access_token, INSTITUTION_SYMBOL, data[0].id, data[0].oclc_numbers);
                }
            })
            .catch((error) => {
                console.log(error);
            });

        }, REQUEST_TIMER);

    } catch (error) {
        console.log(error);
    }
}

/**
 * Makes requests to WorldCat API
 * @param access_token
 * @param INSTITUTION_SYMBOL
 * @param id
 * @param oclc_number
 * @return {Promise<boolean>}
 */
async function request(access_token, INSTITUTION_SYMBOL, id, oclc_number) {

    console.log('Requesting data...');
    console.log(access_token);
    console.log(id);
    console.log(oclc_number);

    try {

        let record = {};
        let where_obj = {};
            where_obj.id = id;
            record.is_locked = 1;

        update(where_obj, record);

        let is_set_response = await HTTP.get(`${HOLDINGS_API_ENDPOINT}?oclcNumber=${oclc_number}&instSymbol=${INSTITUTION_SYMBOL}`, {
            headers: {
                'accept': 'application/atom+json',
                'Authorization': `Bearer ${access_token}`
            },
            timeout: 10000
        });

        if (is_set_response.status !== 200) {
            console.log('ERROR: request to WorldCat failed');
            return false;
        }

        record = {};
        record.is_complete = 1;
        record.worldcat_id = is_set_response.data.content.id;
        record.current_worldcat_oclc_number = is_set_response.data.content.currentOclcNumber;
        record.is_worldcat_record_found = 1;
        record.is_set = is_set_response.data.content.holdingCurrentlySet;
        update(where_obj, record);

    } catch (error) {

        console.log('ERROR: ', error.response);

        if (error.response === undefined || error.response.status === 401) {

            console.log('Restarting ' + process.pid);

            setTimeout(function () {
                process.on('exit', function () {
                    require('child_process').spawn(process.argv.shift(), process.argv, {
                        cwd: process.cwd(),
                        detached : true,
                        stdio: 'inherit'
                    });
                });

                process.exit();

            }, 2000);

        } else if (error.response.status === 404) {

            console.log('ERROR: ', error.response.data);

            let record = {
                is_worldcat_record_found: 0,
                is_complete: 1,
                notes: 'Unable to locate resource'
            };

            let where_obj = {
                id: id
            }

            console.log(record);

            update(where_obj, record);

        } else if (error.response.status === 400) {

            let record = {
                is_worldcat_record_found: 0,
                is_complete: 1,
                notes: 'Bad Request to WorldCat API'
            };

            let where_obj = {
                id: id
            }

            console.log(where_obj);
            console.log(record);

            update(where_obj, record);

        } else if (error.response.status === 403) {

            let record = {
                is_worldcat_record_found: 0,
                is_complete: 1,
                notes: '403 error'
            };

            let where_obj = {
                id: id
            }

            console.log(where_obj);
            console.log(record);

            setTimeout(function() {
                update(where_obj, record);
            }, 5000);

        } else {
            process.exit(1);
        }
    }
}

/**
 * Updates record status
 * @param where_obj
 * @param record
 */
function update(where_obj, record) {

    DB('records')
    .where(where_obj)
    .update(record)
    .then((data) => {

        if (data === 1) {
            console.log('Record updated: ', data);
        } else {
            console.log('Record NOT updated');
        }

    })
    .catch((error) => {
        console.log('DB ERROR: ', error);
        process.exit(1);
    });
}

/**
 * Initiates script
 */
(async () => {

    try {
        console.log('Starting...');
        await get_records();
    } catch(error) {
        console.log(error);
    }

})();
