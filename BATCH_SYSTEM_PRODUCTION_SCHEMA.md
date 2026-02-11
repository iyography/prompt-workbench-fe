# Batch System - Production Database Schema

## Overview
This document outlines the database schema and API changes needed to implement the play batch mapping system in production.

## 1. Database Schema Changes

### New Table: `play_batch_requirements`
```sql
-- Create the play batch requirements table
CREATE TABLE play_batch_requirements (
    id SERIAL PRIMARY KEY,
    play_id INTEGER NOT NULL,
    batch_number INTEGER NOT NULL,
    batch_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraint
    CONSTRAINT fk_play_batch_requirements_play_id 
        FOREIGN KEY (play_id) REFERENCES plays(id) ON DELETE CASCADE,
    
    -- Ensure unique combination of play_id and batch_number
    CONSTRAINT unique_play_batch_combination 
        UNIQUE(play_id, batch_number),
    
    -- Validate batch numbers are in valid range (1-5)
    CONSTRAINT check_batch_number_range 
        CHECK (batch_number >= 1 AND batch_number <= 5),
    
    -- Validate batch names match expected values
    CONSTRAINT check_batch_name_values 
        CHECK (batch_name IN ('linkedin_profile', 'company_enrichment', 'hubspot', 'linkedin_posts', 'linkedin_jobs'))
);

-- Create indexes for better query performance
CREATE INDEX idx_play_batch_requirements_play_id ON play_batch_requirements(play_id);
CREATE INDEX idx_play_batch_requirements_batch_number ON play_batch_requirements(batch_number);

-- Create updated_at trigger (if using PostgreSQL with trigger-based timestamps)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_play_batch_requirements_updated_at 
    BEFORE UPDATE ON play_batch_requirements 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Batch Name Mapping
```sql
-- Reference data for batch definitions
INSERT INTO play_batch_requirements (play_id, batch_number, batch_name) VALUES
-- These are example mappings - actual mappings will be created through the UI
-- Batch 1: LinkedIn Profile
-- Batch 2: Company Enrichment  
-- Batch 3: HubSpot Data
-- Batch 4: LinkedIn Posts
-- Batch 5: LinkedIn Jobs
;
```

## 2. Backend API Changes

### New Endpoints

#### GET `/api/play-batch-mappings/`
Returns all play batch mappings.

**Response:**
```json
[
    {
        "play_id": 1,
        "required_batches": [1, 2, 3]
    },
    {
        "play_id": 2, 
        "required_batches": [1, 2]
    }
]
```

#### POST `/api/play-batch-mappings/`
Create or update batch mappings for a play.

**Request Body:**
```json
{
    "play_id": 1,
    "required_batches": [1, 2, 3, 4]
}
```

**Response:**
```json
{
    "success": true,
    "play_id": 1,
    "required_batches": [1, 2, 3, 4]
}
```

#### DELETE `/api/play-batch-mappings/{play_id}/`
Remove all batch requirements for a specific play.

### Modified Endpoints

#### GET `/api/plays/` (Enhanced)
The existing plays endpoint should be enhanced to include batch requirements.

**Enhanced Response:**
```json
[
    {
        "id": 1,
        "name": "Email Outreach Play",
        "variables": {...},
        "play_steps": [...],
        "output_type": "final",
        "required_batches": [1, 2, 3],  // NEW FIELD
        // ... other existing fields
    }
]
```

## 3. Backend Implementation Details

### Django Model (Python)
```python
class PlayBatchRequirement(models.Model):
    """Defines which data batches a play requires."""
    
    BATCH_CHOICES = [
        (1, 'linkedin_profile'),
        (2, 'company_enrichment'), 
        (3, 'hubspot'),
        (4, 'linkedin_posts'),
        (5, 'linkedin_jobs'),
    ]
    
    play = models.ForeignKey('Play', on_delete=models.CASCADE, related_name='batch_requirements')
    batch_number = models.IntegerField(choices=[(i, name) for i, name in BATCH_CHOICES])
    batch_name = models.CharField(max_length=50, choices=[(name, name) for i, name in BATCH_CHOICES])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['play', 'batch_number']
        indexes = [
            models.Index(fields=['play']),
            models.Index(fields=['batch_number']),
        ]
```

### Django Serializer Enhancement
```python
class PlaySerializer(serializers.ModelSerializer):
    required_batches = serializers.SerializerMethodField()
    
    class Meta:
        model = Play
        fields = ['id', 'name', 'variables', 'play_steps', 'output_type', 'required_batches', ...]
    
    def get_required_batches(self, obj):
        """Return list of required batch numbers for this play."""
        return list(obj.batch_requirements.values_list('batch_number', flat=True).order_by('batch_number'))
```

### API Views
```python
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def get_play_batch_mappings(request):
    """Get all play batch mappings."""
    mappings = []
    plays_with_requirements = Play.objects.filter(batch_requirements__isnull=False).distinct()
    
    for play in plays_with_requirements:
        required_batches = list(play.batch_requirements.values_list('batch_number', flat=True).order_by('batch_number'))
        mappings.append({
            'play_id': play.id,
            'required_batches': required_batches
        })
    
    return Response(mappings)

@api_view(['POST'])
def create_or_update_play_batch_mapping(request):
    """Create or update batch requirements for a play."""
    play_id = request.data.get('play_id')
    required_batches = request.data.get('required_batches', [])
    
    try:
        play = Play.objects.get(id=play_id)
        
        # Clear existing requirements
        PlayBatchRequirement.objects.filter(play=play).delete()
        
        # Create new requirements
        batch_names = {1: 'linkedin_profile', 2: 'company_enrichment', 3: 'hubspot', 4: 'linkedin_posts', 5: 'linkedin_jobs'}
        
        for batch_number in required_batches:
            PlayBatchRequirement.objects.create(
                play=play,
                batch_number=batch_number,
                batch_name=batch_names[batch_number]
            )
        
        return Response({
            'success': True,
            'play_id': play_id,
            'required_batches': required_batches
        })
        
    except Play.DoesNotExist:
        return Response({'error': 'Play not found'}, status=404)
    except Exception as e:
        return Response({'error': str(e)}, status=400)
```

## 4. Migration Strategy

### Phase 1: Database Migration
1. Run the SQL schema creation script in production
2. Verify table creation and constraints
3. Test with sample data

### Phase 2: Backend Deployment  
1. Deploy new API endpoints
2. Test API endpoints with frontend
3. Verify data persistence

### Phase 3: Frontend Integration
1. Update frontend to use real API endpoints instead of localStorage
2. Test batch management interface
3. Verify extension integration

### Phase 4: Data Population
1. Use the batch management interface to map existing plays
2. Review and validate mappings
3. Test extension with real batch requirements

## 5. Rollback Plan

If issues arise, the rollback procedure is:

1. Remove new API endpoints from backend
2. Drop the `play_batch_requirements` table
3. Frontend will fall back to localStorage storage
4. Extension will use current text-based batch detection

## 6. Testing Checklist

- [ ] Database schema creates successfully
- [ ] Foreign key constraints work properly  
- [ ] API endpoints return correct data
- [ ] Batch management UI saves/loads correctly
- [ ] Extension respects batch requirements
- [ ] Performance impact is minimal
- [ ] Data persistence works across sessions

## 7. Security Considerations

- All API endpoints should require authentication
- Validate play ownership before allowing batch modifications
- Sanitize input data to prevent SQL injection
- Add rate limiting to prevent abuse

## 8. Performance Considerations

- Indexed queries on play_id and batch_number
- Batch API calls to reduce database hits
- Cache frequently accessed play batch data
- Consider denormalizing if query performance becomes an issue

## Notes for Implementation

1. **Careful with Production**: Test all database changes in staging first
2. **Backward Compatibility**: Extension should gracefully handle missing batch data
3. **Data Validation**: Ensure batch numbers are always 1-5
4. **User Permissions**: Only authorized users should access batch management
5. **Monitoring**: Add logging for batch requirement changes