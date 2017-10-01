#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
rm derpinewtab.zip && cd ${DIR}/derpinewtab && zip -r ../derpinewtab.zip *
