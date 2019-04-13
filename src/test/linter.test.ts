//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import { validateOz } from '../linter';
import { DiagnosticSeverity } from 'vscode';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as vscode from 'vscode';
// import * as myExtension from '../extension';

// Defines a Mocha test suite to group tests of similar kind together
suite("Linter Tests", function () {
    const filename:string = "oz_file.oz";

    // Defines a Mocha unit test
    test("Linter Nothing", function() {
        assert.equal(validateOz("", filename, 0,0).length, 0, "Empty String should return nothing");
    });

    test("Warning: Unused Variable Lint", function() {
        const compilerWarning = `%******************** binding analysis warning ******************
%**
%** local variable Y used only once
%**
%** in file "top level", line 7, column 10`
        const errors = validateOz(compilerWarning, filename, 0, 0);
        assert.equal(errors.length, 1, "one error should be reported");
        assert.equal(errors[0].fileName, filename, "filename does not match");
        assert.equal(errors[0].line, 7, "error line does not match");
        assert.equal(errors[0].column, 10, "error column does not match");
        assert.equal(errors[0].severity, DiagnosticSeverity.Warning, "reported error should be a warning");
        assert.equal(errors[0].message, "binding analysis: local variable Y used only once", "error message does not match");
    });

    test("Two Warnings", function() {
        const compilerMessage = `%******************** binding analysis warning ******************
%**
%** local variable Y used only once
%**
%** in file "top level", line 7, column 10

%******************** binding analysis warning ******************
%**
%** local variable Q used only once
%**
%** in file "top level", line 18, column 10
% -------------------- accepted`
        const errors = validateOz(compilerMessage, filename, 0, 0);
        assert.equal(errors.length, 2, "two errors should be reported");
    });

    test("Verify offsets", function() {
        const compilerWarning = `%******************** binding analysis warning ******************
%**
%** local variable Y used only once
%**
%** in file "top level", line 7, column 10`
        const errors = validateOz(compilerWarning, filename, 5, 15);
        assert.equal(errors.length, 1, "one error should be reported");
        assert.equal(errors[0].fileName, filename, "filename does not match");
        assert.equal(errors[0].line, 12, "error line does not match");
        assert.equal(errors[0].column, 25, "error column does not match");
    });

    test("Verify Syntax Errors", function() {
        const compilerMessage = `%************************** syntax error ************************
%**
%** expression at statement position
%**
%** in file "top level", line 11, column 7

%********************* binding analysis error *******************
%**
%** variable WW not introduced
%**
%** in file "top level", line 11, column 7
%** ------------------ rejected (2 errors)`
        const errors = validateOz(compilerMessage, filename, 0, 0);
        assert.equal(errors.length, 2, "two errors should be returned");
        const syntaxError = errors[0];
        assert.equal(syntaxError.fileName, filename, "filename does not match");
        assert.equal(syntaxError.column, 7, "error column does not match");
        assert.equal(syntaxError.line, 11, "error line does not match");
        assert.equal(syntaxError.message, "syntax: expression at statement position", "error message does not match");
        assert.equal(syntaxError.severity, DiagnosticSeverity.Error, "error severity does not match");

        const baError = errors[1];
        assert.equal(baError.fileName, filename, "filename does not match");
        assert.equal(baError.column, 7, "error column does not match");
        assert.equal(baError.line, 11, "error line does not match");
        assert.equal(baError.message, "binding analysis: variable WW not introduced", "error message does not match");
        assert.equal(baError.severity, DiagnosticSeverity.Error, "error severity does not match");

    })

    test("Error: Static Analysis", function() {
        const compilerMessage = `%********************** static analysis error *******************
%**
%** illegal arity in application
%**
%** Arity found:          1
%** Expected:             2
%** Application (names):  {Loo _}
%** Application (values): {<P/2> _<optimized>}
%** in file "top level", line 13, column 7

%********************** static analysis error *******************
%**
%** illegal arity in application
%**
%** Arity found:          1
%** Expected:             2
%** Application (names):  {Loo _}
%** Application (values): {<P/2> 10}
%** in file "top level", line 17, column 1
%** ------------------ rejected (2 errors)`
        const errors = validateOz(compilerMessage, filename, 0, 0);
        assert.equal(errors.length, 2, "two errors should be reported");
        assert.equal(errors[0].fileName, filename, "filename does not match");
        assert.equal(errors[0].line, 13, "error line does not match");
        assert.equal(errors[0].column, 8, "error column does not match");
        assert.equal(errors[0].severity, DiagnosticSeverity.Error, "reported error should be a warning");
        assert.equal(errors[0].message, "static analysis: illegal arity in application", "error message does not match");

        assert.equal(errors[1].fileName, filename, "filename does not match");
        assert.equal(errors[1].line, 17, "error line does not match");
        assert.equal(errors[1].column, 2, "error column does not match");
        assert.equal(errors[1].severity, DiagnosticSeverity.Error, "reported error should be a warning");
        assert.equal(errors[1].message, "static analysis: illegal arity in application", "error message does not match");
    })

});