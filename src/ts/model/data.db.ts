/// <reference path="../define.ts"/>
/// <reference path="data.store.meta.ts"/>
/// <reference path="data.store.history.ts"/>
/// <reference path="data.store.log.ts"/>
/// <reference path="data.store.server.ts"/>

/* MODEL */

module MODULE.MODEL.APP.DATA {
  
  export class DB implements DBInterface {
    constructor() {
      var check = () => {
        var now = new Date().getTime(),
            expires = this.conExpires_;
        if (expires && now > expires) {
          this.closedb();
          this.conExpires_ = 0;
        }
        setTimeout(check, Math.max(this.conExpires_ - now + 100, this.conInterval_));
        this.tasks_.length && State.initiate !== this.state() && !this.nowRetrying && this.opendb(null, true);
      }
      this.conAge_ && setTimeout(check, this.conInterval_);
    }

    IDBFactory: IDBFactory = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB
    IDBKeyRange: IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.msIDBKeyRange

    private database_: IDBDatabase
    private name_: string = NAME
    private version_: number = 4
    private refresh_: number = 10
    private upgrade_: number = 1 // 0:virtual 1:naitive
    private state_: State = State.blank
    database = () => this.database_
    state = () => this.state_
    nowRetrying: boolean = false

    private conAge_: number = 10 * 1000
    private conExpires_: number
    private conInterval_: number = 1000
    private tasks_: { (): void }[] = []

    stores = {
      meta: new StoreMeta<MetaSchema>(this),
      history: new StoreHistory<HistorySchema>(this),
      log: new StoreLog<LogSchema>(this),
      server: new StoreServer<ServerSchema>(this)
    }
    metaNames = {
      version: 'version',
      update: 'update'
    }

    opendb(task: () => void, noRetry?: boolean): void {
      var that = this;

      that.conExtend();

      if (!that.IDBFactory || !task && !that.tasks_.length) { return; }

      'function' === typeof task && that.reserveTask_(task);

      if (State.initiate === that.state() || that.nowRetrying) { return; }

      try {
        that.state_ = State.initiate;

        var request = that.IDBFactory.open(that.name_, that.upgrade_ ? that.version_ : 1);

        request.onblocked = function () {
          that.closedb(State.pause);
          try {
            this.result.close();
            !noRetry && setTimeout(() => that.opendb(null, true), 1000);
          } catch (err) {
            !noRetry && that.initdb_(1000);
          }
        };

        request.onupgradeneeded = function () {
          try {
            var database: IDBDatabase = this.result;
            
            for (var i = database.objectStoreNames ? database.objectStoreNames.length : 0; i--;) { database.deleteObjectStore(database.objectStoreNames[i]); }

            database.createObjectStore(that.stores.meta.name, { keyPath: that.stores.meta.keyPath, autoIncrement: false }).createIndex(that.stores.meta.keyPath, that.stores.meta.keyPath, { unique: true });

            database.createObjectStore(that.stores.history.name, { keyPath: that.stores.history.keyPath, autoIncrement: false }).createIndex('date', 'date', { unique: false });

            database.createObjectStore(that.stores.log.name, { keyPath: that.stores.log.keyPath, autoIncrement: true }).createIndex('date', 'date', { unique: false });

            database.createObjectStore(that.stores.server.name, { keyPath: that.stores.server.keyPath, autoIncrement: false }).createIndex(that.stores.server.keyPath, that.stores.server.keyPath, { unique: true });

          } catch (err) {
            !noRetry && that.initdb_(1000);
          }
        };

        request.onsuccess = function () {
          try {
            var database: IDBDatabase = this.result;
            
            that.checkdb_(database, that.version_, () => {
              that.database_ = database;
              that.state_ = State.open;
              that.conExtend();

              that.digestTask_();

              that.nowRetrying = false;
            }, () => {
              !noRetry && that.initdb_();
            });
          } catch (err) {
            database.close();
            !noRetry && that.initdb_(1000);
          }
        };

        request.onerror = function (event) {
          that.closedb(State.error);
          try {
            this.result.close();
            !noRetry && setTimeout(() => that.opendb(null, true), 1000);
          } catch (err) {
            !noRetry && that.initdb_(1000);
          }
        };
      } catch (err) {
        that.closedb(State.error);
        !noRetry && that.initdb_(1000);
      }
    }

    closedb(state: State = State.close): void {
      this.database_ = null;
      this.state_ = state;

      var database = this.database_;
      database && database.close && database.close();
    }

    deletedb_(): void {
      this.closedb();
      var IDBFactory = this.IDBFactory;
      IDBFactory && IDBFactory.deleteDatabase && IDBFactory.deleteDatabase(this.name_);
    }

    conExtend(): void {
      this.conExpires_ = new Date().getTime() + this.conAge_;
    }

    private initdb_(delay?: number): void {
      var retry = () => {
        if (!this.nowRetrying) {
          this.nowRetrying = true;
          this.deletedb_();
        }
        this.opendb(null, true);
      };

      !delay ? retry() : void setTimeout(retry, delay);
    }

    private checkdb_(database: IDBDatabase, version: number, success: () => void, upgrade: () => void): void {
      var that = this;

      var req = database.transaction(that.stores.meta.name, 'readwrite').objectStore(that.stores.meta.name).get(that.metaNames.version);
      req.onsuccess = function () {
        // version check
        var data: MetaSchema = this.result;
        if (!data || that.upgrade_) {
          this.source.put(<MetaSchema>{ id: that.metaNames.version, value: version });
        } else if (data.value !== version) {
          return void upgrade();
        }

        if (that.refresh_) {
          var req = database.transaction(that.stores.meta.name, 'readwrite').objectStore(that.stores.meta.name).get(that.metaNames.update);
          req.onsuccess = function () {
            // refresh check
            var data: MetaSchema = this.result;
            var days: number = Math.floor(new Date().getTime() / (24 * 60 * 60 * 1000));
            if (!data) {
              this.source.put(<MetaSchema>{ id: that.metaNames.update, value: days + that.refresh_ });
            } else if (data.value <= days) {
              return void upgrade();
            }
            success();
          };
        } else {
          success();
        }
      };
    }

    private reserveTask_(task: () => void): void {
      (this.state() !== State.error || this.tasks_.length < 100) &&
      this.tasks_.push(task);
    }

    private digestTask_(limit: number = 0): void {
      ++limit;
      var task: () => void;
      while (task = limit-- && this.tasks_.pop()) {
        task();
      }
    }

  }

}