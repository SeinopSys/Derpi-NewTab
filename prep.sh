#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ZIPNAME="derpinewtab.zip"
if [ -f "${DIR}/${ZIPNAME}" ]; then
	if rm "${DIR}/${ZIPNAME}"; then
		echo Removed old ZIP
	else
		exit 1
	fi
else
	echo No old ZIP found, continuing...
fi
cd ${DIR}/derpinewtab && zip -r "../${ZIPNAME}" *
