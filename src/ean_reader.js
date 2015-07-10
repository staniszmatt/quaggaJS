/* jshint undef: true, unused: true, browser:true, devel: true */
/* global define */

define(
     [
        "./barcode_reader"
    ],
    function(BarcodeReader) {
        "use strict";
        
        function EANReader(opts) {
            BarcodeReader.call(this, opts);
        }
        
        var properties = {
            CODE_L_START : {value: 0},
            MODULO : {value: 7},
            CODE_G_START : {value: 10},
            START_PATTERN : {value: [1 / 3 * 7, 1 / 3 * 7, 1 / 3 * 7]},
            STOP_PATTERN : {value: [1 / 3 * 7, 1 / 3 * 7, 1 / 3 * 7]},
            MIDDLE_PATTERN : {value: [1 / 5 * 7, 1 / 5 * 7, 1 / 5 * 7, 1 / 5 * 7, 1 / 5 * 7]},
            CODE_PATTERN : {value: [
                [3, 2, 1, 1],
                [2, 2, 2, 1],
                [2, 1, 2, 2],
                [1, 4, 1, 1],
                [1, 1, 3, 2],
                [1, 2, 3, 1],
                [1, 1, 1, 4],
                [1, 3, 1, 2],
                [1, 2, 1, 3],
                [3, 1, 1, 2],
                [1, 1, 2, 3],
                [1, 2, 2, 2],
                [2, 2, 1, 2],
                [1, 1, 4, 1],
                [2, 3, 1, 1],
                [1, 3, 2, 1],
                [4, 1, 1, 1],
                [2, 1, 3, 1],
                [3, 1, 2, 1],
                [2, 1, 1, 3]
            ]},
            CODE_FREQUENCY : {value: [0, 11, 13, 14, 19, 25, 28, 21, 22, 26]},
            SINGLE_CODE_ERROR: {value: 0.67},
            AVG_CODE_ERROR: {value: 0.27},
            FORMAT: {value: "ean_13", writeable: false}
        };
        
        EANReader.prototype = Object.create(BarcodeReader.prototype, properties);
        EANReader.prototype.constructor = EANReader;
        
        EANReader.prototype._decodeCode = function(start, coderange) {
            var counter = [0, 0, 0, 0],
                i,
                self = this,
                offset = start,
                isWhite = !self._row[offset],
                counterPos = 0,
                bestMatch = {
                    error : Number.MAX_VALUE,
                    code : -1,
                    start : start,
                    end : start
                },
                code,
                error,
                normalized;

            if (!coderange) {
                coderange = self.CODE_PATTERN.length;
            }

            for ( i = offset; i < self._row.length; i++) {
                if (self._row[i] ^ isWhite) {
                    counter[counterPos]++;
                } else {
                    if (counterPos === counter.length - 1) {
                        normalized = self._normalize(counter);
                        if (normalized) {
                            for (code = 0; code < coderange; code++) {
                                error = self._matchPattern(normalized, self.CODE_PATTERN[code]);
                                if (error < bestMatch.error) {
                                    bestMatch.code = code;
                                    bestMatch.error = error;
                                }
                            }
                            bestMatch.end = i;
                            if (bestMatch.error > self.AVG_CODE_ERROR) {
                                return null;
                            }
                            return bestMatch;
                        }
                    } else {
                        counterPos++;
                    }
                    counter[counterPos] = 1;
                    isWhite = !isWhite;
                }
            }
            return null;
        };

        EANReader.prototype._findPattern = function(pattern, offset, isWhite, tryHarder, epsilon) {
            var counter = [],
                self = this,
                i,
                counterPos = 0,
                bestMatch = {
                    error : Number.MAX_VALUE,
                    code : -1,
                    start : 0,
                    end : 0
                },
                error,
                j,
                sum,
                normalized;

            if (!offset) {
                offset = self._nextSet(self._row);
            }

            if (isWhite === undefined) {
                isWhite = false;
            }

            if (tryHarder === undefined) {
                tryHarder = true;
            }

            if ( epsilon === undefined) {
                epsilon = self.AVG_CODE_ERROR;
            }

            for ( i = 0; i < pattern.length; i++) {
                counter[i] = 0;
            }

            for ( i = offset; i < self._row.length; i++) {
                if (self._row[i] ^ isWhite) {
                    counter[counterPos]++;
                } else {
                    if (counterPos === counter.length - 1) {
                        sum = 0;
                        for ( j = 0; j < counter.length; j++) {
                            sum += counter[j];
                        }
                        normalized = self._normalize(counter);
                        if (normalized) {
                            error = self._matchPattern(normalized, pattern);

                            if (error < epsilon) {
                                bestMatch.error = error;
                                bestMatch.start = i - sum;
                                bestMatch.end = i;
                                return bestMatch;
                            }
                        }
                        if (tryHarder) {
                            for ( j = 0; j < counter.length - 2; j++) {
                                counter[j] = counter[j + 2];
                            }
                            counter[counter.length - 2] = 0;
                            counter[counter.length - 1] = 0;
                            counterPos--;
                        } else {
                            return null;
                        }
                    } else {
                        counterPos++;
                    }
                    counter[counterPos] = 1;
                    isWhite = !isWhite;
                }
            }
            return null;
        };

        EANReader.prototype._findStart = function() {
            var self = this,
                leadingWhitespaceStart,
                offset = self._nextSet(self._row),
                startInfo;

            while(!startInfo) {
                startInfo = self._findPattern(self.START_PATTERN, offset);
                if (!startInfo) {
                    return null;
                }
                leadingWhitespaceStart = startInfo.start - (startInfo.end - startInfo.start);
                if (leadingWhitespaceStart >= 0) {
                    if (self._matchRange(leadingWhitespaceStart, startInfo.start, 0)) {
                        return startInfo;
                    }
                }
                offset = startInfo.end;
                startInfo = null;
            }
        };

        EANReader.prototype._verifyTrailingWhitespace = function(endInfo) {
            var self = this,
                trailingWhitespaceEnd;

            trailingWhitespaceEnd = endInfo.end + (endInfo.end - endInfo.start);
            if (trailingWhitespaceEnd < self._row.length) {
                if (self._matchRange(endInfo.end, trailingWhitespaceEnd, 0)) {
                    return endInfo;
                }
            }
            return null;
        };

        EANReader.prototype._findEnd = function(offset, isWhite) {
            var self = this,
                endInfo = self._findPattern(self.STOP_PATTERN, offset, isWhite, false);

            return endInfo !== null ? self._verifyTrailingWhitespace(endInfo) : null;
        };

        EANReader.prototype._calculateFirstDigit = function(codeFrequency) {
            var i,
                self = this;

            for ( i = 0; i < self.CODE_FREQUENCY.length; i++) {
                if (codeFrequency === self.CODE_FREQUENCY[i]) {
                    return i;
                }
            }
            return null;
        };

        EANReader.prototype._decodePayload = function(code, result, decodedCodes) {
            var i,
                self = this,
                codeFrequency = 0x0,
                firstDigit;

            for ( i = 0; i < 6; i++) {
                code = self._decodeCode(code.end);
                if (!code) {
                    return null;
                }
                if (code.code >= self.CODE_G_START) {
                    code.code = code.code - self.CODE_G_START;
                    codeFrequency |= 1 << (5 - i);
                } else {
                    codeFrequency |= 0 << (5 - i);
                }
                result.push(code.code);
                decodedCodes.push(code);
            }

            firstDigit = self._calculateFirstDigit(codeFrequency);
            if (firstDigit === null) {
                return null;
            }
            result.unshift(firstDigit);

            code = self._findPattern(self.MIDDLE_PATTERN, code.end, true, false);
            if (code === null) {
                return null;
            }
            decodedCodes.push(code);

            for ( i = 0; i < 6; i++) {
                code = self._decodeCode(code.end, self.CODE_G_START);
                if (!code) {
                    return null;
                }
                decodedCodes.push(code);
                result.push(code.code);
            }

            return code;
        };

        EANReader.prototype._decode = function() {
            var startInfo,
                self = this,
                code,
                result = [],
                decodedCodes = [];

            startInfo = self._findStart();
            if (!startInfo) {
                return null;
            }
            code = {
                code : startInfo.code,
                start : startInfo.start,
                end : startInfo.end
            };
            decodedCodes.push(code);
            code = self._decodePayload(code, result, decodedCodes);
            if (!code) {
                return null;
            }
            code = self._findEnd(code.end, false);
            if (!code){
                return null;
            }

            decodedCodes.push(code);

            // Checksum
            if (!self._checksum(result)) {
                return null;
            }

            return {
                code : result.join(""),
                start : startInfo.start,
                end : code.end,
                codeset : "",
                startInfo : startInfo,
                decodedCodes : decodedCodes
            };
        };

        EANReader.prototype._checksum = function(result) {
            var sum = 0, i;

            for ( i = result.length - 2; i >= 0; i -= 2) {
                sum += result[i];
            }
            sum *= 3;
            for ( i = result.length - 1; i >= 0; i -= 2) {
                sum += result[i];
            }
            return sum % 10 === 0;
        };
        
        return (EANReader);
    }
);