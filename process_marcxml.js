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

const FS = require('fs');
const XML_STREAM_LIB = require('xml-stream');
const TIMER = 30000;
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

try {

    function get_xml_files() {
        const xml_folder = './xml/';
        return FS.readdirSync(xml_folder);
    }

    let xml_files = get_xml_files();

    let timer = setInterval(function () {

        if (xml_files.length === 0) {
            clearInterval(timer);
            console.log('MARCXML Processing Complete.');
            return false;
        }

        let xml_file = xml_files.shift();
        console.log(xml_file);

        const BATCH = xml_file;
        let file_stream = FS.createReadStream('xml/' + BATCH);
        let xml_stream = new XML_STREAM_LIB(file_stream);

        xml_stream.preserve('record');
        xml_stream.on('endElement: record', function (element) {

            let records = element.$children;
            let record = {};
            let oclc_numbers = [];

            for (let i = 0; i < records.length; i++) {

                if (records[i].$name === 'controlfield' && records[i].$.tag === '001') {
                    record.mms_id = records[i].$text;
                }

                /* gets records with populated oclc number field(s) */
                if (records[i].$name === 'datafield' && records[i].$.tag === '035') {
                    for (let k = 0; k < records[i].$children.length; k++) {
                        if (records[i].$children[k].$name === 'subfield' && records[i].$children[k].$.code === 'a' || records[i].$children[k].$.code === 'z') {

                            if (records[i].$children[k].$text.search('CoDU') === -1 &&
                                records[i].$children[k].$text.search('GPO') === -1 &&
                                records[i].$children[k].$text.search('gpo') === -1 &&
                                records[i].$children[k].$text.search('DGPO') === -1 &&
                                records[i].$children[k].$text.search('2C') === -1 &&
                                records[i].$children[k].$text.search('UMI') === -1 &&
                                records[i].$children[k].$text.search('DLC') === -1 &&
                                records[i].$children[k].$text.search('01uode_inst') === -1) {

                                let oclc_number;

                                if (records[i].$children[k].$text.search('(OCoLC)') !== -1 || records[i].$children[k].$text.search('ocm') !== -1) {

                                    let oclc_number_tmp = records[i].$children[k].$text.replace('(OCoLC)', '');
                                    oclc_number = oclc_number_tmp.replace('ocm', '');
                                    oclc_numbers.push(oclc_number);
                                    record.oclc_numbers = oclc_numbers.toString();
                                }
                            }
                        }
                    }
                }

                if (records[i].$name === 'datafield' && records[i].$.tag === '020') {
                    for (let l = 0; l < records[i].$children.length; l++) {
                        if (records[i].$children[l].$.code === 'a') {
                            record.isbn = records[i].$children[l].$text;
                        }
                    }
                }

                if (records[i].$name === 'datafield' && records[i].$.tag === '245') {
                    for (let j = 0; j < records[i].$children.length; j++) {
                        if (records[i].$children[j].$name === 'subfield' && records[i].$children[j].$.code === 'a') {
                            record.title = records[i].$children[j].$text;
                        }
                    }
                }
            }

            try {

                let array = [];

                if (record.oclc_numbers !== undefined) {
                    array = record.oclc_numbers.split(',');
                }

                function findDuplicates(array) {

                    let index = 0;
                    let newArr = [];

                    for (let i = 0; i < array.length - 1; i++) {
                        for (let j = i + 1; j < array.length; j++) {
                            if (array[i] === array[j]) {
                                newArr[index] = array[i];
                                index++;
                            }
                        }
                    }

                    return newArr;
                }

                let filtered_oclc_numbers = findDuplicates(array);

                if (filtered_oclc_numbers.length > 0) {
                    record.oclc_numbers = filtered_oclc_numbers.toString();
                }

                record.batch = BATCH;

                if (record.oclc_numbers === undefined) {
                    record.is_null = 1;
                    record.is_worldcat_record_found = 0;
                    record.is_locked = 1;
                    record.is_complete = 1;
                }

                DB.transaction(function (trx) {
                    DB.insert(record)
                    .into('records')
                    .transacting(trx)
                    .then(trx.commit)
                    .catch(trx.rollback);
                })
                .then(function (inserts) {
                    console.log(record.mms_id);
                    console.log(inserts.length + ' record saved.');
                })
                .catch(function (error) {
                    console.error(error);
                });

            } catch (error) {
                console.log(error);
            }

        });

        xml_stream.on('end', function () {
            console.log('END XML STREAM');
        });

    }, TIMER);

} catch (error) {
    console.log(error);
}
