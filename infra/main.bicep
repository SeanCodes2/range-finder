// Range Finder - Free-tier Static Web App, mirrors the pond-tracker layout.
// Deploy: az deployment group create -g rg-rangefinder -f infra/main.bicep
// Then:   az staticwebapp secrets list -n swa-rangefinder -g rg-rangefinder --query properties.apiKey -o tsv
//         -> store as the GitHub Actions secret AZURE_STATIC_WEB_APPS_API_TOKEN
targetScope = 'resourceGroup'

@description('SWA region (Free tier regions: westus2, centralus, eastus2, westeurope, eastasia).')
param location string = 'centralus'
param swaName string = 'swa-rangefinder'

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: swaName
  location: location
  tags: { app: 'range-finder' }
  sku: { name: 'Free', tier: 'Free' }
  properties: {
    stagingEnvironmentPolicy: 'Disabled'
    allowConfigFileUpdates: true
  }
}

output hostname string = swa.properties.defaultHostname
