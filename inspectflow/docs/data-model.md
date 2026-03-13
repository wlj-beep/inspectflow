# Data Model (Logical)

## Users
- id
- name
- role (Operator | Supervisor | Admin)
- active

## Tools
- id
- name
- type (Variable | Go/No-Go | Attribute)
- itNum

## Parts
- id (part number)
- description

## Operations
- id
- partId
- opNumber
- label

## Dimensions
- id
- operationId
- name
- nominal
- tolPlus
- tolMinus
- unit (in | mm | Ra | deg)
- sampling (first_last | every_5 | every_10 | 100pct)

## DimensionTools (allowed tools)
- dimensionId
- toolId

## Jobs
- id (job number)
- partId
- operationId
- lot
- qty
- status (open | closed | draft | incomplete)
- lockOwnerUserId (nullable)
- lockTimestamp (nullable)

## Records
- id
- jobId
- partId
- operationId
- lot
- qty
- timestamp
- operatorUserId
- status (complete | incomplete)
- oot (bool)
- comment (nullable)

## RecordValues
- recordId
- dimensionId
- pieceNumber
- value (string: numeric or PASS/FAIL)
- isOOT (bool)

## RecordTools
- recordId
- dimensionId
- toolId
- itNum

## MissingPieces
- recordId
- pieceNumber
- reason (Scrapped | Lost | Damaged | Other)
- ncNum (nullable)
- details (nullable)

## AuditLog
- id
- recordId
- userId
- timestamp
- field (dimensionId + pieceNumber)
- beforeValue
- afterValue
- reason
