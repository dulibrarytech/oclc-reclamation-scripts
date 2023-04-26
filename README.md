# OCLC Reclamation Scripts

## Table of Contents

* [README](#readme)
* [Project Documentation](#project-documentation)
* [Releases](#releases)
* [Contact](#contact)

## README

### Background

### Contributing

Check out our [contributing guidelines](/CONTRIBUTING.md) for ways to offer feedback and contribute.

### Licenses

[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

All other content is released under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).

### Local Environment Setup

```
Have MySql 5.5 - 5.7
cd into oclc-reclamation-scripts
npm install
Add .env file in root folder (see .env-example)
Create "xml" folder in web root
Move MARCXML files into xml folder
Create "oclc_reclamation" Database
Import mysql schemas "oclc_reclamation" to db, schema found here https://github.com/dulibrarytech/oclc-reclamation-dashboard/tree/main/db.  Change extensions from .txt to .sql
node process_marcxml.js
node process_oclc_numbers.js
```

### Maintainers

@freyesdulib

### Acknowledgments

## Project Documentation
https://developer.api.oclc.org/wc-metadata#/

## Releases
* v0.5.0-beta [release]() [notes]()


## Contact

Ways to get in touch:

* Fernando Reyes (Developer at University of Denver) - fernando.reyes@du.edu
* Create an issue in this repository
