/**
 * Responsible for providing fast access to important data like entity identifiers, entity event names,
 * created animation controllers etc.
 */

import FileType from "./FileType";
import { readJSON, writeJSON } from "../utilities/JsonFS";
import { BASE_PATH } from "../constants";
import path from "path";
import OmegaCache from "./OmegaCache";
import JSONTree from "./JsonTree";
import fs from "fs";
import deepmerge from "deepmerge";
import EventBus from "../EventBus";

function toUnifiedObj(obj: any) {
    let tmp = [];
    for(let key in obj) {
        tmp.push(obj[key]);
    }

    if(tmp.length > 0)
        return deepmerge.all(tmp, { arrayMerge: (a: any[], b: any[]) => a.concat(b) });
    return {};
}

interface CacheDefConfig {
    key: string;
    path?: string;
    hook?: string;
    define_multiple?: boolean;
    definitions?: CacheDefConfig[];
    load?: string;
    except?: string;
    as?: string;
    search?: {
        key: string;
        locations: string[];
        data: string;
    };
};

export type CacheDef = CacheDefConfig | CacheDefConfig[];

export interface LightningCacheData {
    [file_type: string]: {
        [file_path: string]: {
            [cache_key: string]: string[];
        }
    }
}

export default class LightningCache {
    static global_cache: LightningCacheData = undefined;
    static compiled_cache: any = undefined;
    static get l_cache_path() {
        return path.join(BASE_PATH, OmegaCache.project, "bridge/.lightning_cache");
    }
    static init() {
        this.global_cache = undefined;
        this.compiled_cache = undefined;
    }

    static async add(file_path: string, content: JSONTree) {
        if(!(content instanceof JSONTree)) return;
        let type = FileType.get(file_path);
        if(type === "unknown") return;

        let defs = await FileType.getLightningCacheDefs(file_path);
        if(defs === undefined) return;
        
        if(this.global_cache === undefined) {
            try {
                this.global_cache = await readJSON(this.l_cache_path);
            } catch(e) {
                this.global_cache = {};
            }
        }

        if(!Array.isArray(defs) && defs.define_multiple !== undefined)
            await Promise.all((defs.definitions).map(d => this.parse(file_path, type, d, content).catch(console.error)));
        else
            await this.parse(file_path, type, defs, content);

        
        this.compiled_cache = undefined;
        await writeJSON(this.l_cache_path, this.global_cache, true);
    }

    static async parse(file_path: string, type: string, defs: CacheDef, content: JSONTree) {
        let except;
        //LOAD DIFFERENT DEF OPTIONS
        if(!Array.isArray(defs)) {
            if(defs.as !== undefined) {
                type = defs.as;
                defs = defs.definitions;
            } else if(defs.load !== undefined) {
                type = defs.load;
                except = defs.except;
                defs = await FileType.getLightningCacheDefs(undefined, defs.load);

                if(!Array.isArray(defs)) {
                    throw new Error("Deeply nesting cache definitions isn't supported yet!");
                }
            }
        }

        let cache_key = OmegaCache.toCachePath(file_path, false);
        if(this.global_cache[type] === undefined) this.global_cache[type] = {};
        if(this.global_cache[type][cache_key] === undefined) this.global_cache[type][cache_key] = {};
        let cache = this.global_cache[type][cache_key];

        (defs as CacheDefConfig[]).forEach(def => {
            if(def.path !== undefined) {
                try {
                    let data = content.get(def.path).toJSON();
                    if(Array.isArray(data)) {
                        cache[def.key] = data;
                    } else if(typeof data === "object") {
                        cache[def.key] = Object.keys(data);
                    } else {
                        cache[def.key] = [ data ];
                    }
                } catch(e) {
                    cache[def.key] = [];
                }
            } else if(def.search !== undefined) {
                let res: string[] = [];
                def.search.locations.forEach(l => {
                    let n = content.get(l);
                    if(n === undefined) return;

                    n.forEach(c => {
                        if(c.key === def.search.key) {
                            if(def.search.data !== undefined) c = c.get(def.search.data);

                            let data = c.toJSON();
                            if(Array.isArray(data)) {
                                res.push(...data);
                            } else if(typeof data === "object") {
                                res.push(...Object.keys(data));
                            } else {
                                res.push(data);
                            }
                        }
                    });
                });
                cache[def.key] = res;
            } else if(def.hook !== undefined) {
                cache[def.key] = EventBus.trigger(`bridge:onCacheHook[${def.hook}]`).flat() || [];
            } else {
                console.warn("Unknown cache definition: ", def);
            }
        });

        if(except)
            cache[except] = [];
    }

    static async load(file_path?: string): Promise<LightningCacheData> {
        if(this.global_cache !== undefined) return this.global_cache;
        
        try {
            return await readJSON(this.l_cache_path);
        } catch(err) {
            return {};
        }
    }

    static async loadType(file_path?: string, type?: string): Promise<{ [cache_key: string]: string[] }> {
        if(type === undefined) type = FileType.get(file_path);

        try {
            if(this.global_cache !== undefined) return this.global_cache[type][OmegaCache.toCachePath(file_path, false)] || {};
            return (await readJSON(this.l_cache_path))[type][OmegaCache.toCachePath(file_path, false)] || {};
        } catch(err) {
            return {};
        }
    }

    static loadSync() {
        if(this.global_cache !== undefined) return this.global_cache;
        try {
            return JSON.parse(fs.readFileSync(this.l_cache_path).toString());
        } catch(err) {
            return {};
        }  
    }

    static async rename(old_path: string, new_path: string) {
        let old_type = FileType.get(old_path);
        let new_type = FileType.get(new_path);

        this.global_cache = await this.load();
        try {
            if(this.global_cache[old_type] === undefined) return;
            if(this.global_cache[new_type] === undefined) this.global_cache[new_type] = {};
            this.global_cache[new_type][OmegaCache.toCachePath(new_path, false)] = this.global_cache[old_type][OmegaCache.toCachePath(old_path, false)];
            delete this.global_cache[old_type][OmegaCache.toCachePath(old_path, false)];
        } catch(e) {}
        
        await writeJSON(this.l_cache_path, this.global_cache, true);
    }
    static async duplicate(what: string, as: string) {
        let old_type = FileType.get(what);
        let new_type = FileType.get(as);

        this.global_cache = await this.load();
        try {
            if(this.global_cache[old_type] === undefined) return;
            if(this.global_cache[new_type] === undefined) this.global_cache[new_type] = {};
            this.global_cache[new_type][OmegaCache.toCachePath(as, false)] = this.global_cache[old_type][OmegaCache.toCachePath(what, false)];
        } catch(e) {}
        
        await writeJSON(this.l_cache_path, this.global_cache, true);
    }
    static async clear(file_path: string) {
        let type = FileType.get(file_path);
        if(type === "unknown") return;

        this.global_cache = await this.load();
        try {
            delete this.global_cache[type][OmegaCache.toCachePath(file_path, false)];
        } catch(e) {}
        await writeJSON(this.l_cache_path, this.global_cache, true);
    }

    static async getCompiled() {
        if(this.compiled_cache !== undefined) return this.compiled_cache;
        let cache = await this.load();
        let res: any = {};

        for(let key in cache) {
            if(cache[key] !== null)
                res[key] = toUnifiedObj(cache[key]);
        }

        this.compiled_cache = res;
        return res;
    }
    static getCompiledSync() {
        if(this.compiled_cache !== undefined) return this.compiled_cache;
        let cache = this.loadSync();
        let res: any = {};

        for(let key in cache) {
            if(cache[key] !== null)
                res[key] = toUnifiedObj(cache[key]);
        }

        this.compiled_cache = res;
        return res;
    }
}