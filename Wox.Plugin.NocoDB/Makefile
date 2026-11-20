PLUGIN_PACKAGE := release/Wox.Plugin.NocoDB.wox
PACKAGE_FILES := plugin.json README.md dist/index.js dist/icons.js dist/nocodb.js

.PHONY: package verify-package clean

package:
	npm run build
	rm -rf release/package $(PLUGIN_PACKAGE)
	mkdir -p release/package/dist
	cp plugin.json README.md release/package/
	cp dist/index.js dist/icons.js dist/nocodb.js release/package/dist/
	cd release/package && zip -q -X -r ../Wox.Plugin.NocoDB.wox plugin.json README.md dist
	rm -rf release/package
	$(MAKE) verify-package

verify-package:
	test -f $(PLUGIN_PACKAGE)
	test "$$(unzip -Z1 $(PLUGIN_PACKAGE) | sort | tr '\n' ' ')" = "README.md dist/ dist/icons.js dist/index.js dist/nocodb.js plugin.json "
	unzip -p $(PLUGIN_PACKAGE) plugin.json | cmp - plugin.json
	unzip -p $(PLUGIN_PACKAGE) dist/index.js | cmp - dist/index.js
	unzip -p $(PLUGIN_PACKAGE) plugin.json | python3 -m json.tool >/dev/null

clean:
	rm -rf dist release/package $(PLUGIN_PACKAGE)
