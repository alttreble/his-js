import fetch from "cross-fetch";
import {JSDOM} from "jsdom";
// @ts-ignore
import { Xsd2JsonSchema } from "xsd2jsonschema";
import {compile} from 'json-schema-to-typescript'
import {NHIS_ENTITIES_URL} from "./config";
import {writeFileSync} from "fs";

function fetchXSD(url: string) {
  return fetch(url)
    .then((response) => response.text())
    .then(parseXSD)
    .then(inlineInclude);
}

function parseXSD(XSDString: string) {
  return new JSDOM(XSDString, {
    contentType: "text/xml"
  });
}

async function inlineInclude(xsd: JSDOM) {
  const document = xsd.window.document;
  const root = document.documentElement;
  const includes = document.getElementsByTagName("xs:include");
  for (let i = 0; i < includes.length; i++) {
    const include = includes[i];
    const refSchemaURL = include.getAttribute("schemaLocation");
    if (!refSchemaURL) {
      return;
    }
    const {document: refSchemaDocument} = (await fetchXSD(refSchemaURL))?.window || {};
    root.removeChild(include);
    root.prepend(...refSchemaDocument?.documentElement.children || []);
  }
  return xsd;
}

function toJSONSchema(xsd: JSDOM) {
  const xs2js = new Xsd2JsonSchema();

  const convertedSchemas = xs2js.processAllSchemas({
    schemas: {'nhis.xsd': xsd.serialize()}
  });

  return convertedSchemas['nhis.xsd'].getJsonSchema();
}

function toTSDefinitions(jsonSchema: object) {
  return compile(jsonSchema, "NHIS", {
    ignoreMinAndMaxItems: true
  });
}

function writeTypeDefinitions(ts: string) {
  writeFileSync('types/nhis.d.ts', ts.replace(/@/gm, ""))
}

fetchXSD(NHIS_ENTITIES_URL)
  .then(x => x && toJSONSchema(x))
  .then(toTSDefinitions)
  .then(writeTypeDefinitions);
