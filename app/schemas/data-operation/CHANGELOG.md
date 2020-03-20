## [0.5.0] - 2020-03-03
### Changed
- format - Added a few additional subfields to support regridding. New subfields are interpolation, scaleExtent, and scaleSize.
  - interpolation - A string specifying the interpolation method.
  - scaleExtent - An object with x and y properties that are both objects with fields min and max. scaleExtent.x.min, scaleExtent.x.max, scaleExtent.y.min, and scaleExtent.y.max specify the scaling extent for the scaling operation.
  - scaleSize - An object with x and y properties that are both numbers specifying the scaling in the x and y dimensions to use for the scaling operation.

## [0.4.0] - 2020-02-18
### Added
- temporal - Object with two ISO 8601 date time fields: start and end. Used to indicate temporal subsetting to be performend between the start and end times. If only a start or only an end are provided the range should be considered unbounded for the start or end respectively.

## [0.3.0] - 2020-02-05
### Added
- isSynchronous - Synchronous request mode - True if the request is going to be returned synchronously back to the end user. Note a backend service can still use a callback URL to indicate completion.
- requestId - UUID to uniquely identify a request. Should be used in all logging messages.

## [0.2.0] - 2019-12-03
### Added
- client - A string identifier indicating the client submitting the request

## [0.1.0] - 2019-10-11
### Added
- Initial verision