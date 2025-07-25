#!/usr/bin/env node

// Use native fetch (available in Node 18+)

async function testCrossLanguageAPI() {
  console.log('🧪 Testing Cross-Language API Endpoint\n');

  try {
    // Get project list first
    const projectsResponse = await fetch('http://localhost:6969/api/projects');
    const projectsData = await projectsResponse.json();
    const projects = projectsData.data || projectsData;
    
    if (!Array.isArray(projects)) {
      console.log('❌ Unexpected projects response:', projectsData);
      return;
    }
    
    console.log(`Found ${projects.length} projects\n`);

    // Use the first project (should be the test-repos project)
    const microservicesProject = projects[0];
    
    if (!microservicesProject) {
      console.log('❌ No projects found');
      return;
    }

    console.log(`Using project: ${microservicesProject.name} (ID: ${microservicesProject.id})\n`);

    // Test semantic insights endpoint
    console.log('📊 Testing Semantic Insights API...');
    const insightsUrl = `http://localhost:6969/api/insights/getSemanticInsights?projectId=${microservicesProject.id}`;
    const insightsResponse = await fetch(insightsUrl);
    const insightsData = await insightsResponse.json();

    if (insightsData.success) {
      console.log('✅ API call successful');
      console.log(`\nData structure:`);
      console.log(`- architecturalInsights: ${insightsData.data.architecturalInsights?.length || 0}`);
      console.log(`- codeQualityInsights: ${insightsData.data.codeQualityInsights?.length || 0}`);
      console.log(`- crossLanguageInsights: ${insightsData.data.crossLanguageInsights?.length || 0}`);
      console.log(`- stats: ${JSON.stringify(insightsData.data.stats)}`);

      if (insightsData.data.crossLanguageInsights) {
        console.log('\n🌐 Cross-Language Insights:');
        insightsData.data.crossLanguageInsights.forEach((insight, idx) => {
          console.log(`\n${idx + 1}. ${insight.title || insight.type}`);
          console.log(`   Description: ${insight.description}`);
          if (insight.affectedSymbols) {
            console.log(`   Affected symbols: ${insight.affectedSymbols.length}`);
          }
        });
      } else {
        console.log('\n❌ No crossLanguageInsights in response');
      }
    } else {
      console.log('❌ API call failed:', insightsData.error);
    }

    // Test relationships endpoint to see cross-language relationships
    console.log('\n\n📊 Testing Relationships API...');
    const relUrl = `http://localhost:6969/api/database/relationships?projectId=${microservicesProject.id}`;
    const relResponse = await fetch(relUrl);
    const relData = await relResponse.json();

    if (relData.success) {
      console.log(`Total relationships: ${relData.data.length}`);
      
      // Check for cross-language indicators in metadata
      const crossLangRels = relData.data.filter(rel => {
        if (!rel.metadata) return false;
        try {
          const meta = typeof rel.metadata === 'string' ? JSON.parse(rel.metadata) : rel.metadata;
          return meta.crossLanguage === true || meta.crossLanguageType;
        } catch {
          return false;
        }
      });

      console.log(`Cross-language relationships (by metadata): ${crossLangRels.length}`);
      
      if (crossLangRels.length > 0) {
        console.log('\nCross-language relationships found:');
        crossLangRels.forEach((rel, idx) => {
          console.log(`\n${idx + 1}. Type: ${rel.type}`);
          console.log(`   From: ${rel.fromSymbol?.name} (${rel.fromSymbol?.language})`);
          console.log(`   To: ${rel.toSymbol?.name} (${rel.toSymbol?.language})`);
          console.log(`   Metadata: ${rel.metadata}`);
        });
      }
    }

    // Direct database query for comparison
    console.log('\n\n📊 Database Analysis...');
    const statsUrl = `http://localhost:6969/api/stats/overview`;
    const statsResponse = await fetch(statsUrl);
    const statsData = await statsResponse.json();
    
    if (statsData.success) {
      console.log('Project statistics:');
      console.log(`- Total symbols: ${statsData.data.totalSymbols}`);
      console.log(`- Total relationships: ${statsData.data.totalRelationships}`);
      console.log(`- Languages: ${statsData.data.languages?.join(', ') || 'N/A'}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testCrossLanguageAPI().catch(console.error);