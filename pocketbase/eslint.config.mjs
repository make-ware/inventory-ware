// @ts-check
import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        files: ["pb_hooks/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: {
                // PocketBase globals - see pb_data/types.d.ts
                $app: "readonly",
                Record: "readonly",
                Collection: "readonly",
                // Request-based hooks
                onRecordAfterCreateSuccess: "readonly",
                onRecordAfterUpdateSuccess: "readonly",
                onRecordAfterDeleteSuccess: "readonly",
                onRecordAfterCreateError: "readonly",
                onRecordAfterUpdateError: "readonly",
                onRecordAfterDeleteError: "readonly",
                onRecordCreateRequest: "readonly",
                onRecordUpdateRequest: "readonly",
                onRecordDeleteRequest: "readonly",
                // Model-based hooks
                onModelAfterCreateSuccess: "readonly",
                onModelAfterUpdateSuccess: "readonly",
                onModelAfterDeleteSuccess: "readonly",
                onModelAfterCreateError: "readonly",
                onModelAfterUpdateError: "readonly",
                onModelAfterDeleteError: "readonly",
                // Other hooks
                onRecordEnrich: "readonly",
                onRecordValidate: "readonly",
                onRecordCreate: "readonly",
                onRecordUpdate: "readonly",
                onRecordDelete: "readonly",
                onRecordCreateExecute: "readonly",
                onRecordUpdateExecute: "readonly",
                onRecordDeleteExecute: "readonly",
                routerAdd: "readonly",
                cronAdd: "readonly",
                migrate: "readonly",
                console: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "no-undef": "error",
            "no-console": "off",
            "prefer-const": "warn",
            eqeqeq: ["warn", "always"],
            curly: ["warn", "all"],
        },
    },
];
