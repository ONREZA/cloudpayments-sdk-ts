#!/usr/bin/env bun
import { makeReport } from "./sync.js";

console.log(await makeReport());
