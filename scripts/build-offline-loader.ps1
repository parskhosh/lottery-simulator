param(
  [string]$Output = (Join-Path $PSScriptRoot "..\js\offline-loader.js")
)

$jsDir = Join-Path $PSScriptRoot "..\js"
if (-not (Test-Path $jsDir)) {
  throw "Cannot locate js directory: $jsDir"
}

$files = Get-ChildItem -Path $jsDir -Filter "*.js" | Where-Object { $_.Name -ne "offline-loader.js" }
if (-not $files) {
  throw "No JS modules found in $jsDir"
}

$moduleMap = [ordered]@{}
foreach ($file in $files) {
  $relative = "./js/$($file.Name)"
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
  $moduleMap[$relative] = [Convert]::ToBase64String($bytes)
}

$json = ($moduleMap | ConvertTo-Json -Compress)
$jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$jsonBase64 = [Convert]::ToBase64String($jsonBytes)

$template = @"
(function(){
  const hasDecoder = typeof TextDecoder !== "undefined";
  const decoder = hasDecoder ? new TextDecoder("utf-8") : null;

  function decodeBytes(bytes) {
    if (hasDecoder) {
      return decoder.decode(bytes);
    }
    return decodeURIComponent(Array.from(bytes, (b) => "%" + ("0" + b.toString(16)).slice(-2)).join(""));
  }

  const jsonBinary = atob("__JSON_B64__");
  const jsonBytesArr = new Uint8Array(jsonBinary.length);
  for (let i = 0; i < jsonBinary.length; i++) {
    jsonBytesArr[i] = jsonBinary.charCodeAt(i);
  }
  const base64Sources = JSON.parse(decodeBytes(jsonBytesArr));

  const sources = {};
  for (const key in base64Sources) {
    const binary = atob(base64Sources[key]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    sources[key] = decodeBytes(bytes);
  }

  const moduleUrls = new Map();
  const processing = new Set();

  function resolve(from, spec) {
    if (!spec.startsWith(".") && !spec.startsWith("/")) return null;
    const baseParts = from.split("/");
    baseParts.pop();
    const specParts = spec.split("/");
    for (const part of specParts) {
      if (part === "." || part === "") continue;
      if (part === "..") {
        if (baseParts.length > 0) baseParts.pop();
      } else {
        baseParts.push(part);
      }
    }
    let resolved = baseParts.join("/");
    if (!resolved.startsWith("./") && !resolved.startsWith("../")) {
      resolved = "./" + resolved;
    }
    return resolved;
  }

  function rewriteImports(modulePath, code) {
    const importFromRegex = /import\s+([\s\S]*?)\s+from\s+(['"])([^'"\\]+)\2/g;
    const importBareRegex = /import\s+(['"])([^'"\\]+)\1/g;
    const importDynamicRegex = /import\s*\(\s*(['"])([^'"\\]+)\1\s*\)/g;

    code = code.replace(importDynamicRegex, (match, quote, spec) => {
      const resolved = resolve(modulePath, spec);
      if (!resolved || !sources[resolved]) return match;
      const depUrl = createModuleUrl(resolved);
      return `import(${quote}${depUrl}${quote})`;
    });

    code = code.replace(importFromRegex, (match, imports, quote, spec) => {
      const resolved = resolve(modulePath, spec);
      if (!resolved || !sources[resolved]) return match;
      const depUrl = createModuleUrl(resolved);
      return `import ${imports} from ${quote}${depUrl}${quote}`;
    });

    code = code.replace(importBareRegex, (match, quote, spec) => {
      const resolved = resolve(modulePath, spec);
      if (!resolved || !sources[resolved]) return match;
      const depUrl = createModuleUrl(resolved);
      return `import ${quote}${depUrl}${quote}`;
    });

    return code;
  }

  function createModuleUrl(modulePath) {
    if (moduleUrls.has(modulePath)) return moduleUrls.get(modulePath);
    if (processing.has(modulePath)) throw new Error("Circular dependency while loading " + modulePath);
    processing.add(modulePath);

    const source = sources[modulePath];
    if (source === undefined) {
      throw new Error("Offline source missing for " + modulePath);
    }

    const rewritten = rewriteImports(modulePath, source);
    const blob = new Blob([rewritten], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    moduleUrls.set(modulePath, url);
    processing.delete(modulePath);
    return url;
  }

  const entryUrl = createModuleUrl("./js/app.js");
  import(entryUrl).catch((err) => {
    console.error("Offline loader failed:", err);
    alert("Offline load failed. Please check the console.");
  });
})();
"@

$content = $template.Replace("__JSON_B64__", $jsonBase64)

$outputPath = Resolve-Path -Path $Output -ErrorAction SilentlyContinue
if (-not $outputPath) {
  $outputDir = Split-Path -Path $Output -Parent
  if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
  }
  $outputPath = $Output
} else {
  $outputPath = $outputPath.Path
}

[System.IO.File]::WriteAllText($outputPath, $content, [System.Text.Encoding]::UTF8)
Write-Host ("offline-loader.js rebuilt with {0} modules." -f $moduleMap.Count)
