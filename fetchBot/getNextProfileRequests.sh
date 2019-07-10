#!/usr/bin/env bash

set -e

# temporary script for issue143

source ../thirdparty/aws-sqs/utils.sh

function getNextSqsMessage {
  request="$(aws sqs receive-message --queue-url $(queueUrl) --visibility-timeout $1 | jq .Messages[0])"
  requestBody="$(echo $request | jq .Body | tr -d \")"
  requestReceiptHandle="$(echo $request | jq .ReceiptHandle | tr -d \")"
  msg="$requestBody,$requestReceiptHandle"
}

for i in $(seq 1 100); do
  getNextSqsMessage 60
  login="$(echo $msg | cut -d',' -f1)"
  echo "$i" >&2
  echo "$login"
  receiptHandle="$(echo $msg | cut -d',' -f3)"
  aws sqs delete-message --queue-url "$(queueUrl)" --receipt-handle "$receiptHandle"
done