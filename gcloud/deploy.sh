#!/usr/bin/env bash

name=sendToUbidots
localpath=gcloud
trigger=--trigger-topic
topic=sigfox.types.sendToUbidots
export options="--memory=1024MB --timeout=500"

./gcloud/functiondeploy.sh ${name}   ${localpath} ${trigger} ${topic}
